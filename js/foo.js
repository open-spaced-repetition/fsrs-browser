export function foo (){
  _x();
}

let _x = () => { console.log("Default foo") };

export function setFoo(x){
  _x = x;
}
