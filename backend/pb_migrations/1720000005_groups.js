/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  // 1. Create groups collection
  const groups = new Collection({
    type: "base",
    name: "groups",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.role = 'admin'",
    updateRule: "@request.auth.role = 'admin'",
    deleteRule: "@request.auth.role = 'admin'",
    fields: [
      {
        name: "name",
        type: "text",
        required: true,
        max: 200,
      },
      {
        name: "active",
        type: "bool",
      },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_groups_name ON groups (name)",
    ],
  });
  app.save(groups);

  // 2. Add group field to employees collection
  const employees = app.findCollectionByNameOrId("employees");
  employees.fields.add(
    new Field({
      name: "group",
      type: "relation",
      maxSelect: 1,
      collectionId: groups.id,
      cascadeDelete: false,
      required: false,
    })
  );
  app.save(employees);
}, (app) => {
  // Remove group field from employees collection
  const employees = app.findCollectionByNameOrId("employees");
  employees.fields.removeByName("group");
  app.save(employees);

  // Delete groups collection
  try {
    const groups = app.findCollectionByNameOrId("groups");
    app.delete(groups);
  } catch (_) {
    // already gone
  }
});
