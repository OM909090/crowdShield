export function calculateDensity(points){


const area=400;


const density =
points.length / area;



if(density>0.8)

return "HIGH";


if(density>0.4)

return "MEDIUM";


return "LOW";


}