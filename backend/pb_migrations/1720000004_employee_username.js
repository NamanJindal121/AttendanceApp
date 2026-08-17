/// <reference path="../pb_data/types.d.ts" />

// Adds `employees.username` — the short handle the admin form already collects
// and the login screen already advertises ("Email or Username"), but which was
// never a field on the collection:
//   - the admin employee table rendered a permanently blank Username column
//   - authWithPassword only accepted the full email, since passwordAuth
//     identityFields listed `email` alone
//
// Existing rows are backfilled from the local-part of their email (the form
// builds email as `username@jindal.biz`), then the unique index and the
// identity-field registration are applied — in that order, so the index is
// never built over a column of empty strings.
migrate((app) => {
  const employees = app.findCollectionByNameOrId("employees");

  employees.fields.add(
    new Field({
      name: "username",
      type: "text",
      required: true,
      max: 50,
    })
  );
  app.save(employees);

  // --- backfill from email local-part, de-duplicating on collision ----------
  const taken = {};
  const rows = app.findRecordsByFilter("employees", "id != ''", "", 0, 0);
  for (const row of rows) {
    if (row.get("username")) {
      taken[row.get("username")] = true;
      continue;
    }
    const base = String(row.get("email") || "").split("@")[0] || ("user" + row.id);
    let handle = base;
    let n = 2;
    while (taken[handle]) {
      handle = base + n;
      n++;
    }
    taken[handle] = true;
    row.set("username", handle);
    app.save(row);
  }

  // --- uniqueness + allow logging in with the handle -----------------------
  const withIndex = app.findCollectionByNameOrId("employees");
  withIndex.indexes = [
    ...withIndex.indexes,
    "CREATE UNIQUE INDEX idx_employees_username ON employees (username)",
  ];
  withIndex.passwordAuth.identityFields = ["email", "username"];
  app.save(withIndex);
}, (app) => {
  const employees = app.findCollectionByNameOrId("employees");
  employees.passwordAuth.identityFields = ["email"];
  employees.indexes = employees.indexes.filter(
    (i) => !i.includes("idx_employees_username")
  );
  app.save(employees);

  const stripped = app.findCollectionByNameOrId("employees");
  stripped.fields.removeByName("username");
  app.save(stripped);
});
