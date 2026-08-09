// Run with: npm run seed:demo
// Creates a pre-verified authority account and one "ongoing" event, so
// /events, the crowd dashboard, command center, analytics, and the map all
// have something real to render immediately. Crowd/gate/risk numbers on
// those pages are generated automatically by the mock simulator the moment
// an event exists — you don't need a separate step to "start" simulating.
import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";
import Event from "../models/Event.js";

const DEMO_AUTHORITY = {
  name: "Demo Authority",
  email: "demo.authority@crowdhelp.local",
  mobile: "9000000001",
  password: "Demo@1234",
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  let authority = await User.findOne({ email: DEMO_AUTHORITY.email });
  if (!authority) {
    authority = await User.create({
      ...DEMO_AUTHORITY,
      age: 35,
      gender: "Other",
      emergencyContact: DEMO_AUTHORITY.mobile,
      language: "English",
      role: "authority",
      organizationId: "DEMO-AUTH-001",
      isVerifiedAuthority: true, // pre-verified so you can skip the admin approval step while testing
    });
    console.log(`Demo authority created — login with ${DEMO_AUTHORITY.email} / ${DEMO_AUTHORITY.password}`);
  } else {
    console.log(`Demo authority already exists (${DEMO_AUTHORITY.email})`);
  }

  const existingEvent = await Event.findOne({ name: "Demo Rath Yatra" });
  if (existingEvent) {
    console.log("Demo event already exists:", existingEvent._id.toString());
    await mongoose.disconnect();
    process.exit(0);
  }

  const now = new Date();
  const startDate = new Date(now.getTime() - 60 * 60 * 1000); // started 1h ago, so it shows as "ongoing"
  const endDate = new Date(now.getTime() + 5 * 60 * 60 * 1000); // ends in 5h

  const event = await Event.create({
    name: "Demo Rath Yatra",
    type: "Festival",
    description: "Seeded demo event for testing crowd dashboards, command center, analytics, and the venue map.",
    startDate,
    endDate,
    expectedAttendance: 45000,
    location: {
      venueName: "Grand Road",
      address: "Grand Road, Puri, Odisha",
      coordinates: { type: "Point", coordinates: [85.8312, 19.8032] }, // Puri, Odisha
    },
    createdBy: authority._id,
  });

  console.log("Demo event created:", event._id.toString());
  console.log("Log in as the demo authority to see it under /authority/events, or as any citizen under /events.");

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
