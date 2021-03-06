import { Component, OnInit } from '@angular/core';

import { I18n } from '@ngx-translate/i18n-polyfill';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';

import * as _ from 'lodash';
import { forkJoin, Observable } from 'rxjs';
import { PoolService } from '../../../shared/api/pool.service';
import { RbdService } from '../../../shared/api/rbd.service';
import { CriticalConfirmationModalComponent } from '../../../shared/components/critical-confirmation-modal/critical-confirmation-modal.component';
import { ActionLabelsI18n } from '../../../shared/constants/app.constants';
import { Icons } from '../../../shared/enum/icons.enum';
import { NotificationType } from '../../../shared/enum/notification-type.enum';
import { CdTableAction } from '../../../shared/models/cd-table-action';
import { CdTableColumn } from '../../../shared/models/cd-table-column';
import { CdTableSelection } from '../../../shared/models/cd-table-selection';
import { Permission } from '../../../shared/models/permissions';
import { AuthStorageService } from '../../../shared/services/auth-storage.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { TaskListService } from '../../../shared/services/task-list.service';
import { RbdNamespaceFormModalComponent } from '../rbd-namespace-form/rbd-namespace-form-modal.component';

@Component({
  selector: 'cd-rbd-namespace-list',
  templateUrl: './rbd-namespace-list.component.html',
  styleUrls: ['./rbd-namespace-list.component.scss'],
  providers: [TaskListService]
})
export class RbdNamespaceListComponent implements OnInit {
  columns: CdTableColumn[];
  namespaces: any;
  modalRef: BsModalRef;
  permission: Permission;
  selection = new CdTableSelection();
  tableActions: CdTableAction[];

  constructor(
    private authStorageService: AuthStorageService,
    private rbdService: RbdService,
    private poolService: PoolService,
    private modalService: BsModalService,
    private notificationService: NotificationService,
    private i18n: I18n,
    public actionLabels: ActionLabelsI18n
  ) {
    this.permission = this.authStorageService.getPermissions().rbdImage;
    const createAction: CdTableAction = {
      permission: 'create',
      icon: Icons.add,
      click: () => this.createModal(),
      name: this.actionLabels.CREATE
    };
    const deleteAction: CdTableAction = {
      permission: 'delete',
      icon: Icons.destroy,
      click: () => this.deleteModal(),
      name: this.actionLabels.DELETE,
      disable: () => !this.selection.first() || !_.isUndefined(this.getDeleteDisableDesc()),
      disableDesc: () => this.getDeleteDisableDesc()
    };
    this.tableActions = [createAction, deleteAction];
  }

  ngOnInit() {
    this.columns = [
      {
        name: this.i18n('Namespace'),
        prop: 'namespace',
        flexGrow: 1
      },
      {
        name: this.i18n('Pool'),
        prop: 'pool',
        flexGrow: 1
      },
      {
        name: this.i18n('Total images'),
        prop: 'num_images',
        flexGrow: 1
      }
    ];
    this.refresh();
  }

  refresh() {
    this.poolService.list(['pool_name', 'type', 'application_metadata']).then((pools: any) => {
      pools = pools.filter(
        (pool: any) => this.rbdService.isRBDPool(pool) && pool.type === 'replicated'
      );
      const promisses: Observable<any>[] = [];
      pools.forEach((pool: any) => {
        promisses.push(this.rbdService.listNamespaces(pool['pool_name']));
      });
      if (promisses.length > 0) {
        forkJoin(promisses).subscribe((data: Array<Array<string>>) => {
          const result: any[] = [];
          for (let i = 0; i < data.length; i++) {
            const namespaces = data[i];
            const pool_name = pools[i]['pool_name'];
            namespaces.forEach((namespace: any) => {
              result.push({
                id: `${pool_name}/${namespace.namespace}`,
                pool: pool_name,
                namespace: namespace.namespace,
                num_images: namespace.num_images
              });
            });
          }
          this.namespaces = result;
        });
      } else {
        this.namespaces = [];
      }
    });
  }

  updateSelection(selection: CdTableSelection) {
    this.selection = selection;
  }

  createModal() {
    this.modalRef = this.modalService.show(RbdNamespaceFormModalComponent);
    this.modalRef.content.onSubmit.subscribe(() => {
      this.refresh();
    });
  }

  deleteModal() {
    const pool = this.selection.first().pool;
    const namespace = this.selection.first().namespace;
    this.modalRef = this.modalService.show(CriticalConfirmationModalComponent, {
      initialState: {
        itemDescription: 'Namespace',
        itemNames: [`${pool}/${namespace}`],
        submitAction: () =>
          this.rbdService.deleteNamespace(pool, namespace).subscribe(
            () => {
              this.notificationService.show(
                NotificationType.success,
                this.i18n(`Deleted namespace '{{pool}}/{{namespace}}'`, {
                  pool: pool,
                  namespace: namespace
                })
              );
              this.modalRef.hide();
              this.refresh();
            },
            () => {
              this.modalRef.content.stopLoadingSpinner();
            }
          )
      }
    });
  }

  getDeleteDisableDesc(): string | undefined {
    const first = this.selection.first();
    if (first) {
      if (first.num_images > 0) {
        return this.i18n('Namespace contains images');
      }
    }

    return undefined;
  }
}
