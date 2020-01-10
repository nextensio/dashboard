import {Component, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {MatDialog, MatDialogConfig, MatSort, MatTableDataSource} from '@angular/material';
import {Subject, timer} from 'rxjs';
import {retry, switchMap, takeUntil} from 'rxjs/operators';
import {AppConfigService} from '../app-config.service';
import {ApiService, ProjectService, UserService} from '../core/services';
import {GoogleAnalyticsService} from '../google-analytics.service';
import {NotificationActions} from '../redux/actions/notification.actions';
import {AddSshKeyDialogComponent} from '../shared/components/add-ssh-key-dialog/add-ssh-key-dialog.component';
import {ConfirmationDialogComponent} from '../shared/components/confirmation-dialog/confirmation-dialog.component';
import {SSHKeyEntity} from '../shared/entity/SSHKeyEntity';
import {UserGroupConfig} from '../shared/model/Config';

@Component({
  selector: 'kubermatic-sshkey',
  templateUrl: './sshkey.component.html',
  styleUrls: ['./sshkey.component.scss'],
})

export class SSHKeyComponent implements OnInit, OnDestroy {
  loading = true;
  sshKeys: SSHKeyEntity[] = [];
  userGroup: string;
  userGroupConfig: UserGroupConfig;
  projectID: string;
  isShowPublicKey = [];
  displayedColumns: string[] = ['stateArrow', 'name', 'fingerprint', 'creationTimestamp', 'actions'];
  toggledColumns: string[] = ['publickey'];
  dataSource = new MatTableDataSource<SSHKeyEntity>();
  @ViewChild(MatSort, {static: true}) sort: MatSort;
  private _unsubscribe: Subject<any> = new Subject();

  constructor(
      private readonly _api: ApiService, private readonly _userService: UserService,
      private readonly _appConfigService: AppConfigService, public dialog: MatDialog,
      private readonly _googleAnalyticsService: GoogleAnalyticsService,
      private readonly _projectService: ProjectService) {}

  ngOnInit(): void {
    this.userGroupConfig = this._appConfigService.getUserGroupConfig();
    this.dataSource.sort = this.sort;
    this.sort.active = 'name';
    this.sort.direction = 'asc';

    this._projectService.selectedProject
        .pipe(switchMap(project => {
          this.projectID = project.id;
          return this._userService.currentUserGroup(this.projectID);
        }))
        .pipe(switchMap(group => {
          this.userGroup = group;
          return timer(0, 10 * this._appConfigService.getRefreshTimeBase());
        }))
        .pipe(takeUntil(this._unsubscribe))
        .subscribe(() => this.refreshSSHKeys());
  }

  ngOnDestroy(): void {
    this._unsubscribe.next();
    this._unsubscribe.complete();
  }

  shouldTogglePublicKey = (index, item) => this.isShowPublicKey[item.id];

  getDataSource(): MatTableDataSource<SSHKeyEntity> {
    this.dataSource.data = this.sshKeys;
    return this.dataSource;
  }

  getPublicKeyName(sshKey: SSHKeyEntity): string {
    return sshKey.spec.publicKey.split(' ')[0];
  }

  getPublicKey(sshKey: SSHKeyEntity): string {
    return sshKey.spec.publicKey.slice(this.getPublicKeyName(sshKey).length + 1, -1);
  }

  refreshSSHKeys(): void {
    this._api.getSSHKeys(this.projectID).pipe(retry(3)).pipe(takeUntil(this._unsubscribe)).subscribe((res) => {
      this.sshKeys = res;
      this.loading = false;
    });
  }

  addSshKey(): void {
    const dialogRef = this.dialog.open(AddSshKeyDialogComponent);
    dialogRef.componentInstance.projectID = this.projectID;

    dialogRef.afterClosed().subscribe((result) => {
      result && this.refreshSSHKeys();  // tslint:disable-line
    });
  }

  deleteSshKey(sshKey: SSHKeyEntity, event: Event): void {
    event.stopPropagation();
    const dialogConfig: MatDialogConfig = {
      disableClose: false,
      hasBackdrop: true,
      data: {
        dialogId: 'km-delete-sshkey-dialog',
        title: 'Delete SSH Key',
        message: `Delete SSH key "<strong>${sshKey.name}</strong>" permanently?`,
        confirmLabel: 'Delete',
        confirmLabelId: 'km-delete-sshkey-dialog-btn',
      },
    };

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, dialogConfig);
    this._googleAnalyticsService.emitEvent('sshKeyOverview', 'deleteSshKeyOpened');

    dialogRef.afterClosed().subscribe((isConfirmed: boolean) => {
      if (isConfirmed) {
        this._api.deleteSSHKey(sshKey.id, this.projectID).subscribe(() => {
          NotificationActions.success(`SSH key ${sshKey.name} has been removed from project ${this.projectID}`);
          this._googleAnalyticsService.emitEvent('sshKeyOverview', 'SshKeyDeleted');
        });
      }
    });
  }

  togglePublicKey(element: SSHKeyEntity): void {
    this.isShowPublicKey[element.id] = !this.isShowPublicKey[element.id];
  }
}