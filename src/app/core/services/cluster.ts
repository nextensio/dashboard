// Copyright 2020 The Kubermatic Kubernetes Platform contributors.
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

import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {MatDialog, MatDialogConfig} from '@angular/material/dialog';
import {AppConfigService} from '@app/config.service';

import {environment} from '@environments/environment';
import {ConfirmationDialogComponent} from '@shared/components/confirmation-dialog/component';
import {LabelFormComponent} from '@shared/components/label-form/component';
import {TaintFormComponent} from '@shared/components/taint-form/component';
import {Addon} from '@shared/entity/addon';
import {EtcdRestore} from '@shared/entity/backup';
import {
  Cluster,
  ClusterPatch,
  CNIPluginVersions,
  CreateClusterModel,
  Finalizer,
  MasterVersion,
  ProviderSettingsPatch,
} from '@shared/entity/cluster';
import {Event} from '@shared/entity/event';
import {Health} from '@shared/entity/health';
import {ClusterMetrics, NodeMetrics} from '@shared/entity/metrics';
import {Node} from '@shared/entity/node';
import {SSHKey} from '@shared/entity/ssh-key';
import {merge, Observable, of, Subject, timer} from 'rxjs';
import {catchError, filter, shareReplay, switchMap, switchMapTo, take} from 'rxjs/operators';
import {ExternalCluster, ExternalClusterModel, ExternalClusterPatch} from '@shared/entity/external-cluster';
import {ExternalMachineDeployment} from '@shared/entity/external-machine-deployment';

@Injectable()
export class ClusterService {
  private readonly _refreshTime = 10; // in seconds
  private _providerSettingsPatch = new Subject<ProviderSettingsPatch>();
  private _restRoot: string = environment.restRoot;
  private _newRestRoot: string = environment.newRestRoot;
  private _headers: HttpHeaders = new HttpHeaders();
  private _clusters$ = new Map<string, Observable<Cluster[]>>();
  private _externalClusters$ = new Map<string, Observable<ExternalCluster[]>>();
  private _cluster$ = new Map<string, Observable<Cluster>>();
  private _externalCluster$ = new Map<string, Observable<ExternalCluster>>();
  private _refreshTimer$ = timer(0, this._appConfig.getRefreshTimeBase() * this._refreshTime);
  private _onClustersUpdate = new Subject<void>();
  private _onExternalClustersUpdate = new Subject<void>();
  providerSettingsPatchChanges$ = this._providerSettingsPatch.asObservable();
  onClusterUpdate = new Subject<void>();
  onExternalClusterUpdate = new Subject<void>();

  constructor(
    private readonly _matDialog: MatDialog,
    private readonly _http: HttpClient,
    private readonly _appConfig: AppConfigService
  ) {}

  changeProviderSettingsPatch(patch: ProviderSettingsPatch): void {
    this._providerSettingsPatch.next(patch);
  }

  clusters(projectID: string): Observable<Cluster[]> {
    if (!this._clusters$.get(projectID)) {
      const clusters$ = merge(this._onClustersUpdate, this._refreshTimer$).pipe(
        switchMapTo(this._getClusters(projectID)),
        shareReplay({refCount: true, bufferSize: 1})
      );
      this._clusters$.set(projectID, clusters$);
    }

    return this._clusters$.get(projectID);
  }

  externalClusters(projectID: string): Observable<ExternalCluster[]> {
    if (!this._externalClusters$.get(projectID)) {
      const externalClusters$ = merge(this._onExternalClustersUpdate, this._refreshTimer$).pipe(
        switchMapTo(this._getExternalClusters(projectID)),
        shareReplay({refCount: true, bufferSize: 1})
      );
      this._externalClusters$.set(projectID, externalClusters$);
    }

    return this._externalClusters$.get(projectID);
  }

  refreshClusters(): void {
    this._onClustersUpdate.next();
    this._clusters$.clear();
    this._cluster$.clear();
  }

  refreshExternalClusters(): void {
    this._onExternalClustersUpdate.next();
    this._externalClusters$.clear();
    this._externalCluster$.clear();
  }

  cluster(projectID: string, clusterID: string): Observable<Cluster> {
    const id = `${projectID}-${clusterID}`;

    if (!this._cluster$.get(id)) {
      const cluster$ = merge(this.onClusterUpdate, this._refreshTimer$)
        .pipe(switchMapTo(this._getCluster(projectID, clusterID)))
        .pipe(shareReplay({refCount: true, bufferSize: 1}));

      this._cluster$.set(id, cluster$);
    }

    return this._cluster$.get(id);
  }

  externalCluster(projectID: string, clusterID: string): Observable<ExternalCluster> {
    return merge(this.onExternalClusterUpdate, this._refreshTimer$)
      .pipe(switchMapTo(this._getExternalCluster(projectID, clusterID)))
      .pipe(shareReplay({refCount: true, bufferSize: 1}));
  }

  create(projectID: string, createClusterModel: CreateClusterModel): Observable<Cluster> {
    createClusterModel.nodeDeployment.spec.template.labels = LabelFormComponent.filterNullifiedKeys(
      createClusterModel.nodeDeployment.spec.template.labels
    );
    createClusterModel.nodeDeployment.spec.template.taints = TaintFormComponent.filterNullifiedTaints(
      createClusterModel.nodeDeployment.spec.template.taints
    );

    const url = `${this._newRestRoot}/projects/${projectID}/clusters`;
    return this._http.post<Cluster>(url, createClusterModel);
  }

  patch(projectID: string, clusterID: string, patch: ClusterPatch): Observable<Cluster> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters/${clusterID}`;
    return this._http.patch<Cluster>(url, patch);
  }

  patchExternalCluster(projectID: string, clusterID: string, patch: ExternalClusterPatch): Observable<ExternalCluster> {
    const url = `${this._newRestRoot}/projects/${projectID}/kubernetes/clusters/${clusterID}`;
    return this._http.patch<ExternalCluster>(url, patch);
  }

  updateExternalCluster(projectID: string, clusterID: string, model: ExternalClusterModel): Observable<Cluster> {
    const url = `${this._newRestRoot}/projects/${projectID}/kubernetes/clusters/${clusterID}`;
    return this._http.put<Cluster>(url, model);
  }

  delete(projectID: string, clusterID: string, finalizers?: {[key in Finalizer]: boolean}): Observable<any> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters/${clusterID}`;
    if (finalizers !== undefined) {
      for (const key of Object.keys(finalizers)) {
        this._headers = this._headers.set(key, finalizers[key].toString());
      }
    }

    return this._http.delete(url, {headers: this._headers});
  }

  showDisconnectClusterDialog(cluster: ExternalCluster, projectID: string): Observable<any> {
    const dialogConfig: MatDialogConfig = {
      disableClose: false,
      hasBackdrop: true,
      data: {
        title: 'Disconnect Cluster',
        message: `Are you sure you want to disconnect ${cluster.name} cluster?`,
        confirmLabel: 'Disconnect',
      },
    };

    return this._matDialog
      .open(ConfirmationDialogComponent, dialogConfig)
      .afterClosed()
      .pipe(filter(isConfirmed => isConfirmed))
      .pipe(switchMap(_ => this._deleteExternalCluster(projectID, cluster.id)))
      .pipe(take(1));
  }

  upgrades(projectID: string, clusterID: string): Observable<MasterVersion[]> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters/${clusterID}/upgrades`;
    return this._http.get<MasterVersion[]>(url).pipe(catchError(() => of<MasterVersion[]>([])));
  }

  externalClusterUpgrades(projectID: string, clusterID: string): Observable<MasterVersion[]> {
    const url = `${this._newRestRoot}/projects/${projectID}/kubernetes/clusters/${clusterID}/upgrades`;
    return this._http.get<MasterVersion[]>(url).pipe(catchError(() => of<MasterVersion[]>([])));
  }

  cniVersions(projectID: string, clusterID: string): Observable<CNIPluginVersions> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters/${clusterID}/cniversions`;
    return this._http
      .get<CNIPluginVersions>(url)
      .pipe(catchError(() => of<CNIPluginVersions>({} as CNIPluginVersions)));
  }

  metrics(projectID: string, clusterID: string): Observable<ClusterMetrics> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters/${clusterID}/metrics`;
    return this._http.get<ClusterMetrics>(url).pipe(catchError(() => of<ClusterMetrics>({} as ClusterMetrics)));
  }

  externalClusterMetrics(projectID: string, clusterID: string): Observable<ClusterMetrics> {
    const url = `${this._newRestRoot}/projects/${projectID}/kubernetes/clusters/${clusterID}/metrics`;
    return this._http.get<ClusterMetrics>(url).pipe(catchError(() => of<ClusterMetrics>({} as ClusterMetrics)));
  }

  externalClusterNodesMetrics(projectID: string, clusterID: string): Observable<NodeMetrics[]> {
    const url = `${this._newRestRoot}/projects/${projectID}/kubernetes/clusters/${clusterID}/nodesmetrics`;
    return this._http.get<NodeMetrics[]>(url).pipe(catchError(() => of<NodeMetrics[]>([])));
  }

  events(projectID: string, clusterID: string): Observable<Event[]> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters/${clusterID}/events`;
    return this._http.get<Event[]>(url).pipe(catchError(() => of<Event[]>([])));
  }

  externalClusterEvents(projectID: string, clusterID: string): Observable<Event[]> {
    const url = `${this._newRestRoot}/projects/${projectID}/kubernetes/clusters/${clusterID}/events`;
    return this._http.get<Event[]>(url).pipe(catchError(() => of<Event[]>()));
  }

  externalClusterNodes(projectID: string, clusterID: string): Observable<Node[]> {
    const url = `${this._newRestRoot}/projects/${projectID}/kubernetes/clusters/${clusterID}/nodes`;
    return this._http.get<Node[]>(url).pipe(catchError(() => of<Node[]>()));
  }

  externalMachineDeployments(projectID: string, clusterID: string): Observable<ExternalMachineDeployment[]> {
    const url = `${this._newRestRoot}/projects/${projectID}/kubernetes/clusters/${clusterID}/machinedeployments`;
    return this._http.get<ExternalMachineDeployment[]>(url).pipe(catchError(() => of<ExternalMachineDeployment[]>()));
  }

  externalMachineDeployment(
    projectID: string,
    clusterID: string,
    machineDeploymentID: string
  ): Observable<ExternalMachineDeployment> {
    const url = `${this._newRestRoot}/projects/${projectID}/kubernetes/clusters/${clusterID}/machinedeployments/${machineDeploymentID}`;
    return this._http
      .get<ExternalMachineDeployment>(url)
      .pipe(catchError(() => of<ExternalMachineDeployment>({} as ExternalMachineDeployment)));
  }

  health(projectID: string, clusterID: string): Observable<Health> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters/${clusterID}/health`;
    return this._http.get<Health>(url).pipe(catchError(() => of<Health>({} as Health)));
  }

  upgradeMachineDeployments(projectID: string, clusterID: string, version: string): Observable<any> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters/${clusterID}/nodes/upgrades`;
    return this._http.put(url, {version} as MasterVersion);
  }

  nodes(projectID: string, clusterID: string): Observable<Node[]> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters/${clusterID}/nodes?hideInitialConditions=true`;
    return this._http.get<Node[]>(url).pipe(catchError(() => of<Node[]>([])));
  }

  deleteNode(projectID: string, clusterID: string, nodeID: string): Observable<any> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters/${clusterID}/machinedeployments/nodes/${nodeID}`;
    return this._http.delete(url);
  }

  nodeUpgrades(controlPlaneVersion: string): Observable<MasterVersion[]> {
    const url = `${this._restRoot}/upgrades/node?control_plane_version=${controlPlaneVersion}`;
    return this._http.get<MasterVersion[]>(url).pipe(catchError(() => of<MasterVersion[]>([])));
  }

  sshKeys(projectID: string, clusterID: string): Observable<SSHKey[]> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters/${clusterID}/sshkeys`;
    return this._http.get<SSHKey[]>(url).pipe(catchError(() => of<SSHKey[]>([])));
  }

  createSSHKey(projectID: string, clusterID: string, sshKeyID: string): Observable<any> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters/${clusterID}/sshkeys/${sshKeyID}`;
    return this._http.put(url, null);
  }

  deleteSSHKey(projectID: string, clusterID: string, sshKeyID: string): Observable<any> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters/${clusterID}/sshkeys/${sshKeyID}`;
    return this._http.delete(url);
  }

  addons(projectID: string, cluster: string): Observable<Addon[]> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters/${cluster}/addons`;
    return this._http.get<Addon[]>(url).pipe(catchError(() => of<Addon[]>([])));
  }

  createAddon(addon: Addon, projectID: string, cluster: string): Observable<Addon> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters/${cluster}/addons`;
    return this._http.post<Addon>(url, addon);
  }

  editAddon(addon: Addon, projectID: string, cluster: string): Observable<Addon> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters/${cluster}/addons/${addon.name}`;
    return this._http.patch<Addon>(url, addon);
  }

  deleteAddon(addonID: string, projectID: string, cluster: string): Observable<any> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters/${cluster}/addons/${addonID}`;
    return this._http.delete(url);
  }

  startExternalCCMMigration(projectID: string, cluster: string): Observable<any> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters/${cluster}/externalccmmigration`;
    return this._http.post<any>(url, {});
  }

  restores(projectID: string): Observable<EtcdRestore[]> {
    const url = `${this._newRestRoot}/projects/${projectID}/etcdrestores`;
    return this._http.get<EtcdRestore[]>(url);
  }

  private _deleteExternalCluster(projectID: string, clusterID: string): Observable<any> {
    const url = `${this._newRestRoot}/projects/${projectID}/kubernetes/clusters/${clusterID}`;
    return this._http.delete(url);
  }

  private _getClusters(projectID: string): Observable<Cluster[]> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters`;
    return this._http.get<Cluster[]>(url).pipe(catchError(() => of<Cluster[]>()));
  }

  private _getExternalClusters(projectID: string): Observable<ExternalCluster[]> {
    const url = `${this._newRestRoot}/projects/${projectID}/kubernetes/clusters`;
    return this._http.get<ExternalCluster[]>(url).pipe(catchError(() => of<ExternalCluster[]>()));
  }

  private _getCluster(projectID: string, clusterID: string): Observable<Cluster> {
    const url = `${this._newRestRoot}/projects/${projectID}/clusters/${clusterID}`;
    return this._http.get<Cluster>(url).pipe(catchError(() => of<Cluster>()));
  }

  private _getExternalCluster(projectID: string, clusterID: string): Observable<ExternalCluster> {
    const url = `${this._newRestRoot}/projects/${projectID}/kubernetes/clusters/${clusterID}`;
    return this._http.get<ExternalCluster>(url).pipe(catchError(() => of<ExternalCluster>()));
  }
}