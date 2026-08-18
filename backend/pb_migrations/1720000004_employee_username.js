/// <reference path="../pb_data/types.d.ts" />

// Adds `employees.username` — the short handle the admin form already collects
// and the login screen already advertises ("Email or Username"), but which was
// never defined in a committed migration:
//   - the admin employee table rendered a permanently blank Username column
//   - authWithPassword only accepted the full email, since passwordAuth
//     identityFields listed `email` alone
//
// IDEMPOTENT — this field was added by hand through the admin UI on the
// existing deployment, so every step below checks the current state first and
// only applies what is actually missing:
//   1. create the field only if absent (an admin-created field keeps whatever
//      configuration it already has; we do not rewrite it)
//   2. backfill blank handles from the email local-part, and rename any
//      duplicates, so the data can satisfy a unique constraint
//   3. add the unique index only if no unique index already covers (username),
//      whatever its name
//   4. register `username` as an auth identity field only if not already listed
//
// Steps run in this order so the index is never built over a column that still
// contains empty strings or duplicates.
migrate((app) => {
  const employees = app.findCollectionByNameOrId("employees");

  if (!employees.fields.getByName("username")) {
    employees.fields.add(
      new Field({
        name: "username",
        type: "text",
        required: true,
        max: 50,
      })
    );
    app.save(employees);
  }

  // --- backfill blanks + de-duplicate existing handles ----------------------
  const taken = {};
  const rows = app.findRecordsByFilter("employees", "id != ''", "", 0, 0);
  for (const row of rows) {
    const current = String(row.get("username") || "");
    let base = current;
    if (!base) {
      base = String(row.get("email") || "").split("@")[0] || ("user" + row.id);
    }
    let handle = base;
    let n = 2;
    while (taken[handle]) {
      handle = base + n;
      n++;
    }
    taken[handle] = true;
    if (handle !== current) {
      row.set("username", handle);
      app.save(row);
    }
  }

  // --- uniqueness + allow logging in with the handle ------------------------
  const target = app.findCollectionByNameOrId("employees");
  let dirty = false;

  const indexes = [...target.indexes];
  // Match any UNIQUE index whose column list is exactly (username), regardless
  // of the name the admin UI may have generated for it.
  const hasUniqueUsername = indexes.some(
    (i) => /unique/i.test(i) && /\(\s*`?username`?\s*\)/i.test(i)
  );
  if (!hasUniqueUsername) {
    target.indexes = [
      ...indexes,
      "CREATE UNIQUE INDEX idx_employees_username ON employees (username)",
    ];
    dirty = true;
  }

  const identity = [...target.passwordAuth.identityFields];
  if (!identity.includes("username")) {
    target.passwordAuth.identityFields = [...identity, "username"];
    dirty = true;
  }

  if (dirty) app.save(target);
}, (app) => {
  const employees = app.findCollectionByNameOrId("employees");
  employees.passwordAuth.identityFields = [...employees.passwordAuth.identityFields]
    .filter((f) => f !== "username");
  employees.indexes = [...employees.indexes].filter(
    (i) => !i.includes("idx_employees_username")
  );
  app.save(employees);

  const stripped = app.findCollectionByNameOrId("employees");
  stripped.fields.removeByName("username");
  app.save(stripped);
});
