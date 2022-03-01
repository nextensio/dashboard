// Copyright 2017 The Kubernetes Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { HttpHeaders, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input } from '@angular/core';
import { Observable } from 'rxjs';
import { Ingress, IngressList, Label, AppDeploymentSpec } from 'typings/root.api';
import { ResourceListBase } from '@common/resources/list';
import { NotificationsService } from '@common/services/global/notifications';
import { EndpointManager, Resource } from '@common/services/resource/endpoint';
import { NamespacedResourceService } from '@common/services/resource/resource';
import { MenuComponent } from '../../list/column/menu/component';
import { ListGroupIdentifier, ListIdentifier } from '../groupids';
import { HttpClient } from '@angular/common/http';

interface NxtUser {
    uid: string;
    name: string;
    email: string;
}

interface NxtHost {
    host: string;
    name: string;
    routeattrs: Array<string>;
}

interface NxtResult {
    Result: string;
    Bundle: AppGroup;
}

interface AppGroup {
    bid: string;
    name: string;
    gateway: string;
    pod: string;
    connectid: string;
    services: Array<string>;
    cpodrepl: number;
    sharedkey: string;
}

@Component({
    selector: 'kd-ingress-list',
    templateUrl: './template.html',
    styleUrls: ['./style.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IngressListComponent extends ResourceListBase<IngressList, Ingress> {
    @Input() endpoint = EndpointManager.resource(Resource.ingress, true).list();

    users: Array<string> = [];
    creating_: false;

    httpOptions = {};
    nxtOk = false;
    nxResult: NxtResult;
    nxtUser = "";
    nxtSvc = "";
    services: Array<string> = [];

    constructor(
        private readonly ingress_: NamespacedResourceService<IngressList>,
        private http: HttpClient,
        notifications: NotificationsService,
        cdr: ChangeDetectorRef
    ) {
        super('ingress', notifications, cdr);
        this.id = ListIdentifier.ingress;
        this.groupId = ListGroupIdentifier.discovery;

        // Register action columns.
        this.registerActionColumn<MenuComponent>('menu', MenuComponent);

        // Register dynamic columns.
        this.registerDynamicColumn('namespace', 'name', this.shouldShowNamespaceColumn_.bind(this));

        this.httpOptions = {
            headers: new HttpHeaders({
                'Authorization': 'Bearer eyJraWQiOiJheUtPWUtkdUs3S2Vxck1xZFB5RlkzSFh1clFYcFByek9nS3ZfZFhpbmF3IiwiYWxnIjoiUlMyNTYifQ.eyJ2ZXIiOjEsImp0aSI6IkFULmRWbWdPRW5wQVBjLVB6enBKRmtwZUI3MXdXaUhXdkNTT3RQZS1QWWNyaGsiLCJpc3MiOiJodHRwczovL2xvZ2luLm5leHRlbnNpby5uZXQvb2F1dGgyL2RlZmF1bHQiLCJhdWQiOiJhcGk6Ly9kZWZhdWx0IiwiaWF0IjoxNjQ2MjUwNTcxLCJleHAiOjE2NDYyNTQxNzEsImNpZCI6IjBvYXYwcTNobjY1STRaa21yNWQ2IiwidWlkIjoiMDB1dXp2bmlsSnZ1ZUFRdVI1ZDYiLCJzY3AiOlsib3BlbmlkIl0sInN1YiI6ImdvcGFAbmV4dGVuc2lvLmNvbSIsInVzZXJ0eXBlIjoic3VwZXJhZG1pbiIsInRlbmFudCI6ImRvZ2Zvb2QifQ.U-WCDu-qhM6KGDpQyq1TDcTF4HxfkyFeLy991pLRDU_jBFdzS1ohdygB7ObANLHYAUY_fk-itl4dsA9qGk9eEc4-KoONSqkWis9xqcrY3GDVqOgIrAbZeWkpvQ3jgO2ctWEzzTQYtEBKq2b1vXYFQtG5AE1pISpDCR64NgikshpXF0bQmEvsTXk3t-XklN_ZSIcvnZ-DH-MsTgdXolb9-ZvFP8XfRmpfQUEnm09vLTwWHr-RD67rSd5JSRr--z4hypPYMflaXQkl754MkgV3DfILfMkn8TsVBgvmsJHInpLpus43xAAmcUEZ-JPauHOqI__qPoPmvFYSf0kleUIsPw',
                'X-Nextensio-Group': 'superadmin',
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }),
        };

        this.http.get<NxtResult>('https://server.nextensio.net:8080/api/v1/tenant/kubernetes/get/bundle/kubernetes', this.httpOptions)
            .subscribe((data: NxtResult) => {
                this.nxResult = { ...data };
                if (this.nxResult.Result == 'ok') {
                    this.nxtOk = true;
                }
                console.log(this.nxResult.Result);
                console.log(this.nxResult.Bundle);
                this.services = this.nxResult.Bundle.services;
            })
    }

    getResourceObservable(params?: HttpParams): Observable<IngressList> {
        return this.ingress_.get(this.endpoint, undefined, undefined, params);
    }

    map(ingressList: IngressList): Ingress[] {
        return ingressList.items;
    }

    getDisplayColumns(): string[] {
        return ['name', 'labels', 'endpoints', 'hosts', 'created'];
    }

    private shouldShowNamespaceColumn_(): boolean {
        return this.namespaceService_.areMultipleNamespacesSelected();
    }

    nxtAdd() {
        if (this.nxtUser != "") {
            let user: NxtUser = { uid: this.nxtUser, name: this.nxtUser, email: this.nxtUser };
            this.http.post<NxtUser>('https://server.nextensio.net:8080/api/v1/tenant/kubernetes/add/user', user, this.httpOptions)
                .subscribe({
                    next: _ => {
                    },
                    error: error => {
                        console.error('There was an error!', error);
                    }
                });
            console.log('POSTED user');
        }

        if (this.nxtSvc != "") {
            let host: NxtHost = { host: this.nxtSvc, name: this.nxtSvc, routeattrs: [] };
            this.http.post<NxtHost>('https://server.nextensio.net:8080/api/v1/tenant/kubernetes/add/hostattr', host, this.httpOptions)
                .subscribe({
                    next: _ => {
                    },
                    error: error => {
                        console.error('There was an error!', error);
                    }
                });

            this.nxResult.Bundle.services.push(this.nxtSvc);
            this.services = this.nxResult.Bundle.services;
            this.http.post<AppGroup>('https://server.nextensio.net:8080/api/v1/tenant/kubernetes/add/bundle', this.nxResult.Bundle, this.httpOptions)
                .subscribe({
                    next: _ => {
                    },
                    error: error => {
                        console.error('There was an error!', error);
                    }
                });
            console.log('POSTED Svc');
        }
    }

    userChangeEvent(event: any) {
        this.nxtUser = event.target.value;
        console.log(this.nxtUser);
    }

    serviceChangeEvent(event: any) {
        this.nxtSvc = event.target.value;
        console.log(this.nxtSvc);
    }
}
