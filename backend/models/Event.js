import mongoose from "mongoose";

const { Schema } = mongoose;

const EVENT_TYPES = ["Festival", "Sports", "Concert", "Religious Gathering", "Political Rally", "Other"];

const pointSchema = new Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], default: undefined }, // [longitude, latitude]
  },
  { _id: false }
);

const locationSchema = new Schema(
  {
    venueName: { type: String, required: true, trim: true, maxlength: 150 },
    // Optional: the location is picked on a map, so a full postal address is no
    // longer required to create an event.
    address: { type: String, trim: true, maxlength: 300 },
    coordinates: { type: pointSchema },
  },
  { _id: false }
);

const eventSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    type: { type: String, required: true, enum: EVENT_TYPES },
    description: { type: String, trim: true, maxlength: 2000 },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    location: { type: locationSchema, required: true },

    expectedAttendance: { type: Number, min: 0 },
    bannerUrl: { type: String, trim: true },

    // "cancelled" is the only manually-set value; upcoming/ongoing/completed
    // are otherwise derived from the current time vs start/end (see computedStatus).
    status: {
      type: String,
      enum: ["upcoming", "ongoing", "completed", "cancelled"],
      default: "upcoming",
    },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

eventSchema.index({ startDate: 1 });
eventSchema.index({ "location.coordinates": "2dsphere" });

eventSchema.methods.computedStatus = function () {
  if (this.status === "cancelled") return "cancelled";
  const now = Date.now();
  if (now < this.startDate.getTime()) return "upcoming";
  if (now <= this.endDate.getTime()) return "ongoing";
  return "completed";
};

// Include the derived status whenever an event is serialized to JSON
eventSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.liveStatus = doc.computedStatus();
    return ret;
  },
});

export const EVENT_TYPE_VALUES = EVENT_TYPES;
export default mongoose.model("Event", eventSchema);
