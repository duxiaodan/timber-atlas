/** Visible upper/lower ridge division. Position and low course count are inferred
 * from the user-supplied Sketchfab view; Liang documents nine upper courses and
 * separately names the lower qiang ridge, without measuring its section. */
export const HIP_RIDGE={stepRun:8.82,upperCourses:9,lowerCourses:3,courseThickness:.032};
export function hipRidgeSpan(index:number,halfDepth:number){
 const boundary=(n:number)=>n===0?0:n===31?halfDepth:Math.abs((.05+n*.4)-HIP_RIDGE.stepRun)<.1?HIP_RIDGE.stepRun:.05+n*.4;
 const from=boundary(index),to=boundary(index+1);
 return {from,to,courses:from>=HIP_RIDGE.stepRun?HIP_RIDGE.lowerCourses:HIP_RIDGE.upperCourses,lower:from>=HIP_RIDGE.stepRun};
}
