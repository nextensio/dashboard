import {async, ComponentFixture, fakeAsync, TestBed, tick} from '@angular/core/testing';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {MatDialogModule, MatDialogRef, MatFormFieldModule, MatInputModule, MatToolbarModule} from '@angular/material';
import {BrowserModule} from '@angular/platform-browser';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {Router} from '@angular/router';

import {ApiService} from '../../../core/services';
import {GoogleAnalyticsService} from '../../../google-analytics.service';
import {fakeProject} from '../../../testing/fake-data/project.fake';
import {RouterStub, RouterTestingModule} from '../../../testing/router-stubs';
import {ApiMockService} from '../../../testing/services/api-mock.service';
import {MatDialogRefMock} from '../../../testing/services/mat-dialog-ref-mock';
import {DialogTitleComponent} from '../dialog-title/dialog-title.component';

import {AddSshKeyDialogComponent} from './add-ssh-key-dialog.component';

const modules: any[] = [
  BrowserModule,
  BrowserAnimationsModule,
  RouterTestingModule,
  ReactiveFormsModule,
  FormsModule,
  MatDialogModule,
  MatFormFieldModule,
  MatToolbarModule,
  MatInputModule,
];

describe('AddSshKeyDialogComponent', () => {
  let fixture: ComponentFixture<AddSshKeyDialogComponent>;
  let component: AddSshKeyDialogComponent;
  let dialogRef: MatDialogRef<AddSshKeyDialogComponent, any>;

  beforeEach(() => {
    TestBed
        .configureTestingModule({
          imports: [
            ...modules,
          ],
          declarations: [
            DialogTitleComponent,
            AddSshKeyDialogComponent,
          ],
          providers: [
            {provide: MatDialogRef, useClass: MatDialogRefMock},
            {provide: ApiService, useClass: ApiMockService},
            {provide: Router, useClass: RouterStub},
            GoogleAnalyticsService,
          ],
        })
        .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AddSshKeyDialogComponent);
    component = fixture.componentInstance;
    component.projectID = fakeProject().id;
    fixture.detectChanges();
    dialogRef = fixture.debugElement.injector.get(MatDialogRef) as MatDialogRef<AddSshKeyDialogComponent, any>;
  });

  it('should create the add node modal cmp', async(() => {
       expect(component).toBeTruthy();
     }));

  it('form invalid when empty', () => {
    expect(component.addSSHKeyForm.valid).toBeFalsy();
  });

  it('name field validity', () => {
    const name = component.addSSHKeyForm.controls['name'];
    let errors = name.errors || {};
    expect(errors['required']).toBeTruthy();

    name.setValue('test');
    errors = name.errors || {};
    expect(errors['required']).toBeFalsy();
  });

  it('submitting a form calls createSSHKey method and closes dialog', fakeAsync(() => {
       expect(component.addSSHKeyForm.valid).toBeFalsy();
       component.addSSHKeyForm.controls['name'].setValue('testname');
       component.addSSHKeyForm.controls['key'].setValue(
           'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCyVGaw1PuEl98f4/7Kq3O9ZIvDw2OFOSXAFVqilSFNkHlefm1iMtPeqsIBp2t9cbGUf55xNDULz/bD/4BCV43yZ5lh0cUYuXALg9NI29ui7PEGReXjSpNwUD6ceN/78YOK41KAcecq+SS0bJ4b4amKZIJG3JWmDKljtv1dmSBCrTmEAQaOorxqGGBYmZS7NQumRe4lav5r6wOs8OACMANE1ejkeZsGFzJFNqvr5DuHdDL5FAudW23me3BDmrM9ifUzzjl1Jwku3bnRaCcjaxH8oTumt1a00mWci/1qUlaVFft085yvVq7KZbF2OPPbl+erDW91+EZ2FgEi+v1/CSJ5 your_username@hostname');
       expect(component.addSSHKeyForm.valid).toBeTruthy();

       const spyDialogRefClose = jest.spyOn(dialogRef, 'close');
       component.addSSHKey();
       tick();
       fixture.detectChanges();

       expect(spyDialogRefClose).toHaveBeenCalledTimes(1);
     }));

  it('validation should fail when SSH key is invalid', fakeAsync(() => {
       expect(component.addSSHKeyForm.valid).toBeFalsy();
       component.addSSHKeyForm.controls['name'].setValue('test');
       component.addSSHKeyForm.controls['key'].setValue('ssh-rsa 7Kq3O9ZIvDwt9cbGUf55xN');
       expect(component.addSSHKeyForm.valid).toBeFalsy();

       component.addSSHKeyForm.controls['key'].setValue('ssh-rda 7Kq3O9ZIvDwt9cbGUf55xN');
       expect(component.addSSHKeyForm.valid).toBeFalsy();

       component.addSSHKeyForm.controls['key'].setValue('test');
       expect(component.addSSHKeyForm.valid).toBeFalsy();
     }));
});