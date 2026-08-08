import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {Toaster} from "react-hot-toast";
import "leaflet/dist/leaflet.css";

import {
BrowserRouter
} from "react-router-dom";


import './index.css'
import App from './App.jsx'


createRoot(
document.getElementById('root')
)
.render(

<StrictMode>

<BrowserRouter>

<Toaster/>

<App/>

</BrowserRouter>

</StrictMode>

)