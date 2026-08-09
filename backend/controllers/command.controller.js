import Event from "../models/Event.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { getSimulatedState, recordTrendPoint } from "../utils/mockCrowdEngine.js";

const buildRecommendations = (state) => {
  const recommendations = [];

  if (state.riskProbability >= 60) {
    recommendations.push({ type: "critical", text: "Congestion critical — redirect incoming crowd away from the busiest zone" });
  } else if (state.riskProbability >= 35) {
    recommendations.push({ type: "warning", text: "Congestion building — consider opening an alternate gate" });
  }

  if (state.openGates < state.totalGates) {
    recommendations.push({ type: "action", text: `Open ${state.gates[state.openGates].name} to ease inflow pressure` });
  }

  recommendations.push({
    type: "deploy",
    text: `Deploy ${Math.max(2, Math.round(state.riskProbability / 10))} additional security personnel to high-density zones`,
  });

  if (state.riskProbability < 25) {
    recommendations.push({ type: "safe", text: "Crowd distribution stable — no intervention required right now" });
  }

  return recommendations;
};

export const getCommandSnapshot = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new ApiError(404, "Event not found");

  const state = getSimulatedState(event);

  const snapshot = {
    currentCrowd: state.currentCrowd,
    riskProbability: state.riskProbability,
    riskLevel: state.riskLevel,
    avgSpeed: state.avgSpeed,
    openGates: state.openGates,
    totalGates: state.totalGates,
    gates: state.gates,
    recommendations: buildRecommendations(state),
    generatedAt: state.generatedAt,
  };

  const trend = recordTrendPoint(req.params.id, {
    time: new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
    people: state.currentCrowd,
    risk: state.riskProbability,
  });

  res.status(200).json({ snapshot, trend });
});
