/// <reference path="../pb_data/types.d.ts" />

// Backfills the two `employees` fields the admin UI already writes but the
// schema never defined:
//   employees.daily_hours : freelancer daily commitment in hours. > 0 flips an
//     employee into freelancer mode (no fixed scheduled_check_in/out); 0 or
//     unset keeps the fixed-schedule behaviour.
//   employees.aadhar_card : scanned Aadhar card image, uploaded from the
//     employee form (the file input accepts image/* only).
migrate((app) => {
  const employees = app.findCollectionByNameOrId("employees");

  employees.fields.add(
    new Field({
      name: "daily_hours",
      type: "number",
      min: 0,
      max: 24,
    })
  );

  employees.fields.add(
    new Field({
      name: "aadhar_card",
      type: "file",
      maxSelect: 1,
      maxSize: 5242880, // 5MB
      mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    })
  );

  app.save(employees);
}, (app) => {
  const employees = app.findCollectionByNameOrId("employees");
  employees.fields.removeByName("daily_hours");
  employees.fields.removeByName("aadhar_card");
  app.save(employees);
});
