export function generateCrowd(){

return Array.from(
{
length:100
},
(_,index)=>({

id:index,

lat:
20.2961+
(Math.random()-0.5)/100,

lng:
85.8245+
(Math.random()-0.5)/100,


speed:
Math.random()*3,


direction:
Math.random()*360


})

)


}