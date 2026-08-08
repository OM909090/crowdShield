export function predictRisk({
    density,
    speed,
    crowdIncrease,
    directionConflict,
    bottleneck
}){


let score = 0;



// Crowd density factor

if(density > 80)
{
    score += 35;
}

else if(density > 50)
{
    score += 20;
}



// Movement speed

if(speed < 0.5)
{
    score += 20;
}

else if(speed < 1)
{
    score += 10;
}



// Sudden crowd increase

if(crowdIncrease > 50)
{
    score += 20;
}


// Opposite movement

if(directionConflict)
{
    score += 15;
}


// Bottleneck

if(bottleneck)
{
    score += 10;
}



let level="LOW";


if(score>=75)
{
    level="CRITICAL";
}

else if(score>=50)
{
    level="HIGH";
}

else if(score>=30)
{
    level="MEDIUM";
}



return{

score,
level

}


}