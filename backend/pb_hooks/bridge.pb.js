/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Bridge ingest route for the LAN-side pyzk poller (plan §C2 fallback).
//
// The poller authenticates as a service account and POSTs already-parsed
// biometric punches here. This route writes them with source=biometric,
// bypassing the app geofence hook (which only applies to the collection's
// request-create path). Idempotent via the unique device_punch_id index.
//
//   POST /api/bridge/punch
//   Authorization: <service account token>
//   { "biometric_user_id", "type", "timestamp", "device_punch_id" }
//
// Only employees with role=admin may call this (the poller uses a dedicated
// admin service account). NB: isolated JS runtime — helpers stay inline.
// ---------------------------------------------------------------------------
routerAdd(
  "POST",
  "/api/bridge/punch",
  (e) => {
    // Require an authenticated admin (the service account).
    if (!e.auth || e.auth.get("role") !== "admin") {
      return e.json(403, { message: "forbidden" });
    }

    const data = e.requestInfo().body;
    const uid = data.biometric_user_id;
    const rawTs = data.timestamp;
    const punchId = data.device_punch_id;

    if (!uid || !rawTs || !punchId) {
      return e.json(400, { message: "missing fields" });
    }

    // Idempotency: already imported?
    try {
      e.app.findFirstRecordByFilter(
        "attendance_records",
        "device_punch_id = {:pid}",
        { pid: punchId }
      );
      return e.json(200, { status: "duplicate" });
    } catch (err) {
      // not found -> proceed
    }

    // Map device user id -> employee.
    let employee;
    try {
      employee = e.app.findFirstRecordByFilter(
        "employees",
        "biometric_user_id = {:uid}",
        { uid: String(uid) }
      );
    } catch (err) {
      return e.json(404, { message: "unmapped biometric_user_id" });
    }

    const MIN_PUNCH_INTERVAL_SECONDS = 5 * 60;

    // Determine type server-side: first punch of the day = check_in, then alternate.
    // Use the punch's own date (not "today") so historical imports also work correctly.
    const punchDate = rawTs.substring(0, 10); // "YYYY-MM-DD"
    let type = "check_in"; // default: first of the day
    let isTooSoon = false;

    try {
      // Find the absolute most recent punch before this one to check the interval
      const previousRecords = e.app.findRecordsByFilter(
        "attendance_records",
        "employee = {:emp} && timestamp <= {:ts}",
        "-timestamp",
        1, // only need the latest
        0,
        { emp: employee.id, ts: rawTs }
      );

      if (previousRecords.length > 0) {
        const prev = previousRecords[0];

        // 1. Check interval (against the absolute previous punch)
        const currentDt = new DateTime(rawTs);
        const secondsSincePrev = Math.abs(currentDt.sub(prev.get("timestamp")).seconds());
        if (secondsSincePrev < MIN_PUNCH_INTERVAL_SECONDS) {
          isTooSoon = true;
        }

        // 2. Check type (only if the previous punch was on the SAME day)
        // PocketBase DateTime string format is "YYYY-MM-DD HH:mm:ss.SSSZ"
        const prevDate = prev.get("timestamp").string().substring(0, 10);
        if (prevDate === punchDate) {
          type = prev.get("type") === "check_in" ? "check_out" : "check_in";
        }
      }
    } catch (err) {
      // no records -> stays check_in, not too soon
    }

    if (isTooSoon) {
      // Return 200 so the poller marks it as processed and drops it from the buffer.
      // If we returned 4xx/5xx, the poller would retry it infinitely.
      return e.json(200, { status: "ignored_too_soon" });
    }

    try {
      const col = e.app.findCollectionByNameOrId("attendance_records");
      const rec = new Record(col);
      rec.set("employee", employee.id);
      rec.set("type", type);
      rec.set("timestamp", new DateTime(rawTs));
      rec.set("source", "biometric");
      rec.set("device_punch_id", punchId);
      rec.set("flagged", false);
      e.app.save(rec);
      return e.json(200, { status: "created", type: type, id: rec.id });
    } catch (err) {
      return e.json(500, { message: "save failed" });
    }
  },
  $apis.requireAuth("employees")
);
