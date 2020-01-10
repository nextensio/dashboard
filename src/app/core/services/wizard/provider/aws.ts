import {HttpClient} from '@angular/common/http';
import {EMPTY, Observable} from 'rxjs';

import {AWSSize, AWSSubnet, AWSVPC} from '../../../../shared/entity/provider/aws/AWS';
import {NodeProvider} from '../../../../shared/model/NodeProviderConstants';

import {Provider} from './provider';

export class AWS extends Provider {
  constructor(http: HttpClient, provider: NodeProvider) {
    super(http, provider);

    this._setRequiredHeaders(AWS.Header.AccessKeyID, AWS.Header.SecretAccessKey);
  }

  credential(credential: string): AWS {
    super._credential(credential);
    return this;
  }

  accessKeyID(accessKeyID: string): AWS {
    if (accessKeyID) {
      this._headers = this._headers.set(AWS.Header.AccessKeyID, accessKeyID);
    }
    return this;
  }

  secretAccessKey(secretAccessKey: string): AWS {
    if (secretAccessKey) {
      this._headers = this._headers.set(AWS.Header.SecretAccessKey, secretAccessKey);
    }
    return this;
  }

  region(region: string): AWS {
    if (region) {
      this._headers = this._headers.set(AWS.Header.Region, region);
    }
    return this;
  }

  vpc(vpc: string): AWS {
    if (vpc) {
      this._headers = this._headers.set(AWS.Header.VPC, vpc);
    }
    return this;
  }

  vpcs(dc: string): Observable<AWSVPC[]> {
    if (!this._hasRequiredHeaders()) {
      return EMPTY;
    }
    const url = `${this._restRoot}/providers/${this._provider}/${dc}/vpcs`;
    return this._http.get<AWSVPC[]>(url, {headers: this._headers});
  }

  subnets(dc: string): Observable<AWSSubnet[]> {
    this._setRequiredHeaders(AWS.Header.AccessKeyID, AWS.Header.SecretAccessKey, AWS.Header.VPC);

    if (!this._hasRequiredHeaders()) {
      return EMPTY;
    }
    const url = `${this._restRoot}/providers/${this._provider}/${dc}/subnets`;
    return this._http.get<AWSSubnet[]>(url, {headers: this._headers});
  }

  flavors(): Observable<AWSSize[]> {
    this._setRequiredHeaders(AWS.Header.Region);
    if (!this._hasRequiredHeaders()) {
      return EMPTY;
    }
    return this._http.get<AWSSize[]>(this._url, {headers: this._headers});
  }
}

export namespace AWS {
  export enum Header {
    AccessKeyID = 'AccessKeyID',
    SecretAccessKey = 'SecretAccessKey',
    VPC = 'VPC',
    Region = 'Region',
  }
}