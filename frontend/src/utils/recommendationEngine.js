export function generateRecommendations({

    riskLevel,
    density,
    bottleneck,
    crowdIncrease,
    directionConflict

}){


let recommendations=[];



if(riskLevel==="CRITICAL" || riskLevel==="HIGH")
{

recommendations.push({

type:"GATE",

priority:"HIGH",

message:
"Open alternate exit gates to reduce crowd pressure"

});


recommendations.push({

type:"SECURITY",

priority:"HIGH",

message:
"Deploy additional security personnel in high density zones"

});


}



if(density>70)
{

recommendations.push({

type:"CROWD",

priority:"MEDIUM",

message:
"Redirect incoming visitors to less crowded areas"

});


}



if(bottleneck)
{

recommendations.push({

type:"BARRIER",

priority:"HIGH",

message:
"Modify barricade configuration near bottleneck"

});


}



if(directionConflict)
{

recommendations.push({

type:"FLOW",

priority:"HIGH",

message:
"Enable one-way pedestrian movement"

});


}



if(crowdIncrease>50)
{

recommendations.push({

type:"ALERT",

priority:"HIGH",

message:
"Broadcast crowd calming announcement"

});

}



return recommendations;


}