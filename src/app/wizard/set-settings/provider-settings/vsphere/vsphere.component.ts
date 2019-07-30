import {Component, Input, OnDestroy, OnInit} from '@angular/core';
import {FormControl, FormGroup, Validators} from '@angular/forms';
import {Subject} from 'rxjs';
import {debounceTime, takeUntil} from 'rxjs/operators';
import {WizardService} from '../../../../core/services';
import {ClusterEntity} from '../../../../shared/entity/ClusterEntity';
import {VSphereNetwork} from '../../../../shared/entity/provider/vsphere/VSphereEntity';
import {ClusterProviderSettingsForm} from '../../../../shared/model/ClusterForm';
import {NodeProvider} from '../../../../shared/model/NodeProviderConstants';
import {FormHelper} from '../../../../shared/utils/wizard-utils/wizard-utils';

@Component({
  selector: 'kubermatic-vsphere-cluster-settings',
  templateUrl: './vsphere.component.html',
})
export class VSphereClusterSettingsComponent implements OnInit, OnDestroy {
  @Input() cluster: ClusterEntity;
  form: FormGroup;
  hideOptional = true;
  loadingNetworks = false;
  networks: VSphereNetwork[] = [];

  private _formHelper: FormHelper;
  private _unsubscribe = new Subject<void>();

  constructor(private _wizard: WizardService) {}

  ngOnInit(): void {
    this.form = new FormGroup({
      infraManagementUsername:
          new FormControl(this.cluster.spec.cloud.vsphere.infraManagementUser.username, Validators.required),
      infraManagementPassword:
          new FormControl(this.cluster.spec.cloud.vsphere.infraManagementUser.password, Validators.required),
      username: new FormControl(this.cluster.spec.cloud.vsphere.username),
      password: new FormControl(this.cluster.spec.cloud.vsphere.password),
      vmNetName: new FormControl(this.cluster.spec.cloud.vsphere.vmNetName),
      folder: new FormControl(this.cluster.spec.cloud.vsphere.folder),
    });

    this._formHelper = new FormHelper(this.form);
    this._formHelper.registerFormControls(
        this.form.controls.infraManagementUsername,
        this.form.controls.infraManagementPassword,
    );

    this.checkNetworkState();

    this.form.valueChanges.pipe(debounceTime(1000)).pipe(takeUntil(this._unsubscribe)).subscribe(() => {
      this.loadNetworks();
      this.checkNetworkState();

      this._formHelper.areControlsValid() ? this._wizard.onCustomPresetsDisable.emit(false) :
                                            this._wizard.onCustomPresetsDisable.emit(true);

      this._wizard.changeClusterProviderSettings(this._clusterProviderSettingsForm(this._formHelper.isFormValid()));
    });

    this._wizard.clusterSettingsFormViewChanged$.pipe(takeUntil(this._unsubscribe)).subscribe((data) => {
      this.hideOptional = data.hideOptional;
    });

    this._wizard.onCustomPresetSelect.pipe(takeUntil(this._unsubscribe)).subscribe(newCredentials => {
      if (newCredentials) {
        this.form.disable();
        return;
      }

      this.form.enable();
    });
  }

  isMissingCredentials(): boolean {
    return this.form.controls.username.value === '' || this.form.controls.password.value === '';
  }

  loadNetworks(): void {
    if (this.isMissingCredentials()) {
      if (this.networks.length > 0) {
        this.form.controls.vmNetName.setValue('');
        this.networks = [];
        return;
      }
      return;
    }

    if (this.networks.length > 0) {
      return;
    }

    this.loadingNetworks = true;
    this._wizard.provider(NodeProvider.VSPHERE)
        .username(this.form.controls.username.value)
        .password(this.form.controls.password.value)
        .datacenter(this.cluster.spec.cloud.dc)
        .networks()
        .pipe(takeUntil(this._unsubscribe))
        .subscribe((networks) => {
          if (networks.length > 0) {
            const sortedNetworks = networks.sort((a, b) => {
              return (a.name < b.name ? -1 : 1) * ('asc' ? 1 : -1);
            });

            this.networks = sortedNetworks;
            if (sortedNetworks.length > 0 && this.form.controls.vmNetName.value !== '0') {
              this.form.controls.vmNetName.setValue(this.cluster.spec.cloud.vsphere.vmNetName);
            }
          } else {
            this.networks = [];
          }
          this.loadingNetworks = false;
        });
  }

  getNetworkFormState(): string {
    if (!this.loadingNetworks && this.isMissingCredentials()) {
      return 'Network';
    } else if (this.loadingNetworks) {
      return 'Loading Networks...';
    } else if (!this.loadingNetworks && this.networks.length === 0) {
      return 'No Networks available';
    } else {
      return 'Network';
    }
  }

  checkNetworkState(): void {
    if (this.networks.length === 0 && this.form.controls.vmNetName.enabled) {
      this.form.controls.vmNetName.disable();
    } else if (this.networks.length > 0 && this.form.controls.vmNetName.disabled) {
      this.form.controls.vmNetName.enable();
    }
  }

  showNetworkHint(): boolean {
    return !this.loadingNetworks && this.isMissingCredentials();
  }

  ngOnDestroy(): void {
    this._unsubscribe.next();
    this._unsubscribe.complete();
  }

  private _clusterProviderSettingsForm(valid: boolean): ClusterProviderSettingsForm {
    let cloudUser = this.form.controls.infraManagementUsername.value;
    let cloudPassword = this.form.controls.infraManagementPassword.value;

    if (this.form.controls.username.value !== '' && this.form.controls.password.value !== '') {
      cloudUser = this.form.controls.username.value;
      cloudPassword = this.form.controls.password.value;
    }

    return {
      cloudSpec: {
        vsphere: {
          username: cloudUser,
          password: cloudPassword,
          vmNetName: this.form.controls.vmNetName.value,
          folder: this.form.controls.folder.value,
          infraManagementUser: {
            username: this.form.controls.infraManagementUsername.value,
            password: this.form.controls.infraManagementPassword.value,
          },
        },
        dc: this.cluster.spec.cloud.dc,
      },
      valid,
    };
  }
}