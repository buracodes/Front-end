import { Observable } from 'rxjs';
import { ApiService } from './api-service';
import { inject } from '@angular/core';
import { IResponse } from '../../model/interface/response.interface';

export abstract class GenericCrudService<T> {
  protected abstract readonly endpoint: string;
  protected readonly api = inject(ApiService);

  getAll(): Observable<IResponse<T[]>> {
    return this.api.get<IResponse<T[]>>(this.endpoint);
  }

  getById(id: string): Observable<IResponse<T>> {
    return this.api.get<IResponse<T>>(`${this.endpoint}/${id}`);
  }

  create(model: T): Observable<IResponse<T>> {
    return this.api.post<IResponse<T>>(this.endpoint, model);
  }

  update(model: T): Observable<IResponse<T>> {
    return this.api.put<IResponse<T>>(this.endpoint, model);
  }

  delete(id: string): Observable<IResponse<null>> {
    return this.api.delete<IResponse<null>>(`${this.endpoint}/${id}`);
  }
}
