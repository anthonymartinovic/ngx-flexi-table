import { 
	Component, 
	ChangeDetectionStrategy, 
	OnChanges, 
	OnInit, 
	AfterViewInit, 
	OnDestroy, 
	Input, 
	Output,
	EventEmitter,
	ViewChild, 
	SimpleChanges, 
	ChangeDetectorRef,
	ErrorHandler,
	HostBinding
} from '@angular/core';
import { Subscription } from 'rxjs';

import { PagerComponent } from './components/pager/pager.component';

import { ColumnConfig, ColumnMap } from './models/column.model';
import { ServerPager } from './models/pager.model';
import { Styles } from './models/styles.model';
import { Init } from './models/init.model';

import { TableDataService } from './data/data.service';

@Component({
	selector: 'ngx-flexi-table',
	host: { 'class': 'ngx-flexi-table' },
	providers: [TableDataService],
	styleUrls: ['./ngx-flexi-table.component.scss'],
	template: `
		<div class="flexi-table-header" [class.hide-table-header-inner]="init && !init.header">
			<div class="table-caption-container" [class.caption-container-border]="init.caption">
				<caption *ngIf="init.caption" class="table-caption">{{ init.caption }}</caption>
			</div>
			<ngx-exporter
				*ngIf="init.exportOptions"
				[init]="init"
				[records]="records"
				[checkedRecords]="checkedRecords"
				(serverExportAll)="onExportAll.emit($event)"
			></ngx-exporter>
			<ngx-filter
				*ngIf="init.filter.show && init.filter.type.toLowerCase() === 'global'"
				[init]="init"
				[columns]="columns"
				[records]="records"
				[globalFilter]="init.filter.keys"
				(recordsChange)="filterRecords($event)"
				(serverGlobalFilterChange)="onFilterChange.emit($event)"
			></ngx-filter>
		</div>
		<div class="flexi-table-content">
			<ngx-table></ngx-table>
		</div>
		<div class="flexi-table-footer" [class.hide-table-footer-inner]="init && !init.footer">
			<ngx-pager
				[init]="init"
				[records]="recordsCopy"
				[pageLimit]="init.pageLimit"
				[pageData]="pageData"
				(pagedRecordsChange)="updatePagedRecords($event)"
				(serverPageChange)="onPageChange.emit($event)"
			></ngx-pager>
		</div>
	`
})
export class FlexiTableComponent implements OnChanges, OnInit, AfterViewInit, OnDestroy {
	recordsSub: Subscription;
	checkedRecordsSub: Subscription;
	filterRecordsSub: Subscription;
	initSetPageSub: Subscription;
	rowSelectionSub: Subscription;
	newTabSelectionSub: Subscription;
	serverFiltersSub: Subscription;
	sortedColumnSub: Subscription;

	@HostBinding('class.hide-table-header') hideTableHeader;
	@HostBinding('class.hide-table-footer') hideTableFooter;
	@HostBinding('class.only-table-content') onlyTableContent;

	@ViewChild(PagerComponent) private _pagerComponent: PagerComponent;

	@Input() init: Init;
	@Input() config: ColumnConfig[];
	@Input() records: {}[];
	@Input() pageData: ServerPager;
	@Input() styles: Styles;

	//GENERAL OUTPUTS
	@Output() onRowSelection: EventEmitter<{}>     = new EventEmitter();
	@Output() onCheckboxChange: EventEmitter<{}[]> = new EventEmitter();
	@Output() onNewTabSelection: EventEmitter<any> = new EventEmitter();

	//SERVER-SPECIFIC OUTPUTS
	@Output() onPageChange: EventEmitter<number> = new EventEmitter();
	@Output() onExportAll: EventEmitter<string>  = new EventEmitter();
	@Output() onFilterChange: EventEmitter<{}>   = new EventEmitter();
	@Output() onSort: EventEmitter<{}>           = new EventEmitter();

	clientSide: boolean = false;
	serverSide: boolean = false;

	preventEmissions: boolean        = false;
	serverSideInitCompleted: boolean = false;

	recordsCopy: {}[];
	checkedRecords: {}[];
	pagedRecords: {}[];
	columns: ColumnMap[];
	sortedColumn: {};

	constructor(
		public tableData: TableDataService,
		private _errorHandler: ErrorHandler,
		private _cdr: ChangeDetectorRef
	) {
		this.recordsSub          = this.tableData.records$.subscribe(records => this.recordsCopy = records);
		this.filterRecordsSub    = this.tableData.filterRecordsSubject$.subscribe(filteredRecords => this.filterRecords(filteredRecords));
		this.initSetPageSub      = this.tableData.initSetPageSubject$.subscribe(() => this.initSetPage());
		this.rowSelectionSub     = this.tableData.rowSelection$.subscribe(row => this.onRowSelection.emit(row));
		this.newTabSelectionSub  = this.tableData.newTabSelection$.subscribe(newTab => this.onNewTabSelection.emit(newTab));
		this.serverFiltersSub    = this.tableData.serverFilters$.subscribe(serverFilters => this.onFilterChange.emit(serverFilters));
		this.sortedColumnSub     = this.tableData.sortedColumn$.subscribe(sortedColumn =>
			(this.serverSide) ? (this.sortedColumn = sortedColumn, this.onSort.emit(this.sortedColumn)) : null
		)
		this.checkedRecordsSub   = this.tableData.checkedRecords$.subscribe(checkedRecords => {
			this.checkedRecords  = checkedRecords;
			if (!this.preventEmissions) this.onCheckboxChange.emit(this.checkedRecords);
		});
	}

	ngOnChanges(changes: SimpleChanges) {
		(this.config)
			? this.columns = this.config.map(col => new ColumnMap(col))
			: this.columns = Object.keys(changes['records'].currentValue[0]).map(key => new ColumnMap({ primeKey: key }));

		this.tableData.publishColumns(this.columns);

		if (
			changes['records'] && changes['records'].previousValue ||
			changes['pageLimit'] && changes['pageLimit'].previousValue
		) 
			this.reDeployTable();
	}

	ngOnInit(): void { this.onInit() };
	onInit(): void {
		if (!this.init) this.init = new Init;
		this.tableData.publishInit(this.init);
		this.tableData.publishStyles(this.styles);

		this.hideTableHeader = (this.init.header) ? false : true;
		this.hideTableFooter = (this.init.footer) ? false : true;
		this.onlyTableContent = (this.hideTableHeader && this.hideTableFooter) ? true : false;

		(!this.init.server) ? this.clientSide = true : this.serverSide = true;

		if (!this.records) return this._errorHandler.handleError(`No records passed into table`);
		
		this.recordsCopy = this.records;
		this.tableData.publishRecords(this.recordsCopy);

		this.preventEmissions = true;
		if (this.clientSide || !this.serverSideInitCompleted) this.tableData.publishCheckedRecords([]);
		this.preventEmissions = false;

		this.serverSideInitCompleted = true;
		this._cdr.detectChanges();
	}

	ngAfterViewInit(): void { this.afterViewInit() };
	afterViewInit(): void {
		this.initSetPage();
	}

	ngOnDestroy(): void {
		this.recordsSub.unsubscribe();
		this.checkedRecordsSub.unsubscribe();
		this.filterRecordsSub.unsubscribe();
		this.initSetPageSub.unsubscribe();
		this.rowSelectionSub.unsubscribe();
		this.newTabSelectionSub.unsubscribe();
		this.serverFiltersSub.unsubscribe();
	}

	reDeployTable(): void {
		this.onInit();
		this.afterViewInit();
	}

	initSetPage(): void {
		(this.serverSide)
			? this._pagerComponent.setPage(this.pageData.currentPage, true)
			: this._pagerComponent.setPage(1, true);

		this._cdr.detectChanges();
	}

	filterRecords(filteredRecords: {}[]): void {
		this.recordsCopy = filteredRecords;
		this.tableData.publishRecords(filteredRecords);
		this.tableData.runIsAllChecked();
		this._cdr.detectChanges();
		this.initSetPage();
	}

	updatePagedRecords(newPagedRecords: {}[]): void {
		this.pagedRecords = newPagedRecords;
		this.tableData.publishPagedRecords(this.pagedRecords);
	}
}
