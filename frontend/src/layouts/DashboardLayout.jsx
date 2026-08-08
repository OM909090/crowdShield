import {
  LayoutDashboard,
  Map,
  Activity,
  ShieldAlert,
  Smartphone,
  BrainCircuit,
  Settings,
  Users,
  Building2,
  FileText
} from "lucide-react";


import {
  Outlet,
  NavLink
} from "react-router-dom";


export default function DashboardLayout(){


const links=[

{
name:"Dashboard",
icon:<LayoutDashboard/>,
path:"/dashboard"
},

{
name:"Crowd Monitoring",
icon:<Users/>,
path:"/crowd"
},

{
name:"Risk Prediction",
icon:<ShieldAlert/>,
path:"/risk"
},

{
name:"AI Recommendations",
icon:<BrainCircuit/>,
path:"/recommendations"
},

{
name:"Live Map",
icon:<Map/>,
path:"/map"
},

{
name:"Analytics",
icon:<Activity/>,
path:"/analytics"
},

{
name:"Citizen App",
icon:<Smartphone/>,
path:"/citizen"
},

{
name:"Settings",
icon:<Settings/>,
path:"/settings"
},

{
name:"Digital Twin",
icon:<Building2/>,
path:"/digital-twin"
},


{
name:"AI Assistant",
icon:<BrainCircuit/>,
path:"/ai-assistant"
},


{
name:"Incident Report",
icon:<FileText/>,
path:"/incident"
}

]


return(

<div className="
min-h-screen
bg-slate-950
text-white
flex
">


{/* Sidebar */}

<aside className="
w-72
hidden md:block
border-r
border-white/10
p-6
">


<h1 className="
text-3xl
font-bold
text-cyan-400
mb-10
">

CrowdHelp

</h1>


<div className="
space-y-3
">


{
links.map((item,index)=>(

<NavLink

key={index}

to={item.path}

className={({isActive})=>

`
flex items-center gap-3
px-4 py-3 rounded-xl
transition

${
isActive
?
"bg-cyan-500 text-black"
:
"hover:bg-white/10"
}

`

}

>


{item.icon}

<span>
{item.name}
</span>


</NavLink>


))
}


</div>


</aside>




{/* Main */}

<main className="
flex-1
p-6
">


<Outlet/>


</main>


</div>

)

}