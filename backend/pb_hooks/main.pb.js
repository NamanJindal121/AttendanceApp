/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Attendance app server-side logic.
//
//  1. Geofence + dedup validation for app check-ins (onRecordCreateRequest).
//  2. ADMS "iclock" receiver route for biometric device push (see adms.pb.js).
//
// Security principle: never trust the client's "I'm at the office" claim — the
// distance and identity are (re)computed / forced on the server.
//
// NOTE: PocketBase runs each hook handler in an isolated pooled JS runtime, so
// handlers CANNOT reference functions/vars from this module's outer scope. Any
// helper a handler needs must be defined *inside* the handler body.
// ---------------------------------------------------------------------------

onRecordCreateRequest((e) => {
  const DEDUP_WINDOW_SECONDS = 90;
  // Minimum time between an employee's consecutive punches. Stops an accidental
  // double-tap (check-in then instant check-out), and vice-versa.
  const MIN_PUNCH_INTERVAL_SECONDS = 5 * 60;

  // Great-circle distance between two lat/lng points, in metres (haversine).
  const distanceMeters = (lat1, lng1, lat2, lng2) => {
    const R = 6371000; // earth radius, metres
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const record = e.record;

  if (!e.auth) {
    throw new ForbiddenError("Authentication required.");
  }

  // Admins / superusers creating records manually (corrections, seeding, or the
  // biometric bridge) skip the geofence entirely. The check honours whatever
  // employee/type/timestamp/source they supply. Regular employees fall through
  // to the enforced app-check-in path below.
  const isPrivileged =
    e.auth.collection().name === "_superusers" ||
    e.auth.get("role") === "admin";
  if (isPrivileged) {
    if (!record.get("source")) record.set("source", "app");
    e.next();
    return;
  }

  // The authenticated employee IS the subject; timestamp is the server clock.
  // Force these regardless of what the client sent so nothing can be forged.
  record.set("employee", e.auth.id);
  record.set("timestamp", new DateTime()); // now
  record.set("source", "app");
  record.set("flagged", false);

  const type = record.get("type");
  if (type !== "check_in" && type !== "check_out") {
    throw new BadRequestError("type must be check_in or check_out.");
  }

  // Load geofence configuration (single settings record).
  let settings;
  try {
    settings = e.app.findFirstRecordByFilter("settings", "id != ''");
  } catch (err) {
    throw new BadRequestError("Attendance is not configured yet. Contact an admin.");
  }

  const officeLat = settings.getFloat("office_lat");
  const officeLng = settings.getFloat("office_lng");
  const radius = settings.getFloat("radius_meters");
  const maxAccuracy = settings.getFloat("max_gps_accuracy_meters");
  const requireSelfie = settings.getBool("require_selfie");

  if (officeLat === 0 && officeLng === 0) {
    throw new BadRequestError("Office location is not set. Contact an admin.");
  }

  const lat = record.getFloat("lat");
  const lng = record.getFloat("lng");
  const accuracy = record.getFloat("gps_accuracy");

  if (!lat || !lng) {
    throw new BadRequestError("Location is required to check in.");
  }

  // Reject untrustworthy fixes: a huge accuracy radius means the position could
  // be far off (or spoofed via IP / wifi geolocation).
  if (!accuracy || accuracy > maxAccuracy) {
    throw new BadRequestError(
      "Your location signal is too weak. Move to an open area and try again."
    );
  }

  const distance = distanceMeters(lat, lng, officeLat, officeLng);
  if (distance > radius) {
    throw new BadRequestError("You must be at the office to check in or out.");
  }

  // Selfie enforcement (the file itself is validated by the collection schema).
  if (requireSelfie && !record.get("selfie")) {
    throw new BadRequestError("A photo is required to check in.");
  }

  // Minimum interval between consecutive punches — blocks accidental double-taps
  // (e.g. checking in then immediately checking out). Compares against the
  // employee's most recent punch of ANY type. Compute inside a try (a lookup
  // glitch shouldn't block a legitimate punch), but throw the rejection outside.
  let secondsSincePrev = null;
  try {
    const prev = e.app.findRecordsByFilter(
      "attendance_records",
      "employee = {:emp}",
      "-timestamp",
      1,
      0,
      { emp: e.auth.id }
    );
    if (prev.length > 0) {
      secondsSincePrev = Math.abs(
        record.get("timestamp").sub(prev[0].get("timestamp")).seconds()
      );
    }
  } catch (err) {
    // ignore lookup errors — don't block on a transient glitch
  }
  if (secondsSincePrev !== null && secondsSincePrev < MIN_PUNCH_INTERVAL_SECONDS) {
    const wait = Math.ceil((MIN_PUNCH_INTERVAL_SECONDS - secondsSincePrev) / 60);
    throw new BadRequestError(
      "Please wait about " + wait + " more minute(s) before your next punch."
    );
  }

  e.next(); // proceed to validation + INSERT

  // --- After a successful insert: advisory duplicate flagging. ---
  // Flag when the same employee logged the same punch type within the window.
  // Never throws — dedup is a soft signal for admins, not a hard gate.
  try {
    const recent = e.app.findRecordsByFilter(
      "attendance_records",
      "employee = {:emp} && type = {:type} && id != {:id}",
      "-timestamp",
      1,
      0,
      { emp: record.get("employee"), type: record.get("type"), id: record.id }
    );
    if (recent.length > 0) {
      const gap = Math.abs(
        record.get("timestamp").sub(recent[0].get("timestamp")).seconds()
      );
      if (gap <= DEDUP_WINDOW_SECONDS) {
        record.set("flagged", true);
        e.app.save(record);
      }
    }
  } catch (err) {
    // advisory only — swallow
  }
}, "attendance_records");
