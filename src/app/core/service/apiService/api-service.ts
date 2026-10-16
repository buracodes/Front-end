import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../../environments/environment";

@Injectable({
    providedIn: 'root'
})

export class ApiService {
    constructor(
        private http: HttpClient
    ){}
    
    private baseUrl = environment.API_URL

    get<T>(endpoint: string): Observable<T>{
        return this.http.get<T>(`${this.baseUrl}${endpoint}`);
    }

    post<T>(endpoint:string,body:unknown): Observable<T> {
        return this.http.post<T>(`${this.baseUrl}${endpoint}`,body);
    }

    put<T>(endpoint:string,body:unknown):Observable<T>{
        return this.http.put<T>(`${this.baseUrl}${endpoint}`,body);
    }

    delete<T>(endpoint:string):Observable<T>{
        return this.http.delete<T>(`${this.baseUrl}${endpoint}`);
    }
}