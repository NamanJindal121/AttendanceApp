/// <reference path="../pb_data/types.d.ts" />

// Adds per-employee scheduled work hours and a configurable office work-week.
//   employees.scheduled_check_in  / scheduled_check_out : "HH:MM" (24h) strings
//   settings.work_days : JSON array of weekday numbers (0=Sun .. 6=Sat)
//   settings.late_grace_minutes : minutes after scheduled_check_in before "late"
migrate((app) => {
  // --- employees: scheduled hours --------------------------------------------
  const employees = app.findCollectionByNameOrId("employees");
  employees.fields.add(
    new Field({
      name: "scheduled_check_in",
      type: "text",
      max: 5, // "HH:MM"
    })
  );
  employees.fields.add(
    new Field({
      name: "scheduled_check_out",
      type: "text",
      max: 5,
    })
  );
  app.save(employees);

  // --- settings: work-week + late grace --------------------------------------
  const settings = app.findCollectionByNameOrId("settings");
  settings.fields.add(
    new Field({
      name: "work_days",
      type: "json",
      maxSize: 100,
    })
  );
  settings.fields.add(
    new Field({
      name: "late_grace_minutes",
      type: "number",
    })
  );
  app.save(settings);

  // Seed defaults on the existing single settings record.
  try {
    const rec = app.findFirstRecordByFilter("settings", "id != ''");
    // Default: Mon–Sat working (0=Sun excluded), 10-minute late grace.
    if (!rec.get("work_days")) rec.set("work_days", [1, 2, 3, 4, 5, 6]);
    if (!rec.get("late_grace_minutes")) rec.set("late_grace_minutes", 10);
    app.save(rec);
  } catch (err) {
    // no settings record yet — the app seeds one elsewhere
  }
}, (app) => {
  // Down: remove the added fields.
  const employees = app.findCollectionByNameOrId("employees");
  employees.fields.removeByName("scheduled_check_in");
  employees.fields.removeByName("scheduled_check_out");
  app.save(employees);

  const settings = app.findCollectionByNameOrId("settings");
  settings.fields.removeByName("work_days");
  settings.fields.removeByName("late_grace_minutes");
  app.save(settings);
});
