export interface IResponse<T>{
    success:boolean;
    message:string;
    errors?:string[];
    data?:T;
}