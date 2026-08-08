import {
Routes,
Route
} from "react-router-dom";


import Landing from "../pages/Landing";
import Login from "../pages/Login";
import Signup from "../pages/Signup";
import Dashboard from "../pages/Dashboard";


import DashboardLayout from "../layouts/DashboardLayout";
import LiveMap from "../pages/LiveMap";
import RiskPrediction from "../pages/RiskPredictions";
import Recommendations from "../pages/Recommendations";
import CitizenApp from "../pages/CitizenApp";

import DigitalTwin from "../pages/DigitalTwin";
import AIAssistant from "../pages/AIAssistant";
import IncidentSummary from "../pages/IncidentSummary";
import CrowdMonitoring from "../pages/CrowdMonitoring";
import Analytics from "../pages/Analytics";
import EventSelection from "../pages/EventsSelection";
import CreateEvent from "../pages/CreateEvent";
import AdminVerification from "../pages/AdminVerification";


export default function AppRoutes(){


return(

<Routes>


<Route path="/" element={<Landing/>}/>

<Route path="/login" element={<Login/>}/>

<Route path="/signup" element={<Signup/>}/>



<Route element={<DashboardLayout/>}>

<Route 
path="/dashboard"
element={<Dashboard/>}
/>

</Route>

<Route
path="/map"
element={<LiveMap />}
/>

<Route
path="/risk"
element={<RiskPrediction />}
/>

<Route

path="/recommendations"

element={<Recommendations />}

/>

<Route

path="/citizen"

element={<CitizenApp />}

/>

<Route
path="/digital-twin"
element={<DigitalTwin/>}
/>


<Route
path="/ai-assistant"
element={<AIAssistant/>}
/>


<Route
path="/incident"
element={<IncidentSummary/>}
/>

<Route
path="/crowd"
element={<CrowdMonitoring />}
/>

<Route
path="/analytics"
element={<Analytics />}
/>

<Route
path="/events"
element={<EventSelection />}
/>

<Route
path="/authority/events"
element={<CreateEvent />}
/>

<Route
path="/admin/verify-authorities"
element={<AdminVerification />}
/>

</Routes>

)

}