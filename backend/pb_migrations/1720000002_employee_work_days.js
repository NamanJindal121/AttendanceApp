/// <reference path="../pb_data/types.d.ts" />

// Per-employee work-week override. When set (non-empty JSON array of weekday
// numbers 0=Sun..6=Sat), it takes precedence over the office-wide
// settings.work_days for that employee's calendar. Empty/unset => use office default.
migrate((app) => {
  const employees = app.findCollectionByNameOrId("employees");
  employees.fields.add(
    new Field({
      name: "work_days",
      type: "json",
      maxSize: 100,
    })
  );
  app.save(employees);
}, (app) => {
  const employees = app.findCollectionByNameOrId("employees");
  employees.fields.removeByName("work_days");
  app.save(employees);
});
