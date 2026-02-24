import { LightningElement, api, wire } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { NavigationMixin } from "lightning/navigation";

// ---- LDS IMPORTS (Industry Standard for single-record CRUD) ----
import { getRecord, getFieldValue } from "lightning/uiRecordApi";
import { deleteRecord } from "lightning/uiRecordApi";
import {
    updateRecord,
    notifyRecordUpdateAvailable,
} from "lightning/uiRecordApi";

// Schema imports — compile-time validated, refactor-safe
import ACCOUNT_NAME_FIELD from "@salesforce/schema/Account.Name";
import ACCOUNT_INDUSTRY_FIELD from "@salesforce/schema/Account.Industry";
import ACCOUNT_PHONE_FIELD from "@salesforce/schema/Account.Phone";
import ACCOUNT_WEBSITE_FIELD from "@salesforce/schema/Account.Website";

// ---- APEX IMPORTS (Only for what LDS can't do: pagination, search, aggregation) ----
import getRelatedContacts from "@salesforce/apex/AccountRelatedRecordsController.getRelatedContacts";
import getRelatedOpportunities from "@salesforce/apex/AccountRelatedRecordsController.getRelatedOpportunities";
import getContactCount from "@salesforce/apex/AccountRelatedRecordsController.getContactCount";
import getOpportunityCount from "@salesforce/apex/AccountRelatedRecordsController.getOpportunityCount";
import searchContacts from "@salesforce/apex/AccountRelatedRecordsController.searchContacts";
import searchOpportunities from "@salesforce/apex/AccountRelatedRecordsController.searchOpportunities";

/**
 * INTERVIEW TALKING POINTS:
 *
 * ┌────────────────────┬──────────────────────────────────────────────────┐
 * │ LDS (uiRecordApi)  │ Single-record CRUD:                             │
 * │                    │ • getRecord — Account info (cached, reactive)   │
 * │                    │ • updateRecord — inline edit save               │
 * │                    │ • deleteRecord — row action delete              │
 * │                    │ • notifyRecordUpdateAvailable                   │
 * ├────────────────────┼──────────────────────────────────────────────────┤
 * │ Custom Apex        │ Complex queries LDS can't do:                   │
 * │                    │ • OFFSET/LIMIT pagination                       │
 * │                    │ • Server-side LIKE search across fields         │
 * │                    │ • COUNT() aggregations for badges               │
 * ├────────────────────┼──────────────────────────────────────────────────┤
 * │ Search             │ • Server-side SOQL LIKE (searches ALL records)  │
 * │                    │ • 300ms debounce to avoid excess API calls      │
 * │                    │ • Disables infinite loading during search       │
 * │                    │ • Clearing search restores paginated view       │
 * └────────────────────┴──────────────────────────────────────────────────┘
 */

// --- Constants ---
const PAGE_SIZE = 50; // Records per page for OFFSET pagination
const SEARCH_DEBOUNCE_MS = 300; // Delay (ms) before firing server-side search

const ACCOUNT_FIELDS = [
    ACCOUNT_NAME_FIELD,
    ACCOUNT_INDUSTRY_FIELD,
    ACCOUNT_PHONE_FIELD,
    ACCOUNT_WEBSITE_FIELD,
];

// Row actions
const ROW_ACTIONS = [
    { label: "View Record", name: "view", iconName: "utility:preview" },
    { label: "Delete", name: "delete", iconName: "utility:delete" },
];

// Contact columns
const CONTACT_COLUMNS = [
    {
        label: "Name",
        fieldName: "recordUrl",
        type: "url",
        sortable: true,
        typeAttributes: {
            label: { fieldName: "Name" },
            target: "_self",
            tooltip: { fieldName: "Name" },
        },
    },
    {
        label: "Email",
        fieldName: "Email",
        type: "email",
        sortable: true,
        editable: true,
    },
    {
        label: "Phone",
        fieldName: "Phone",
        type: "phone",
        sortable: true,
        editable: true,
    },
    {
        label: "Title",
        fieldName: "Title",
        type: "text",
        sortable: true,
        editable: true,
    },
    {
        label: "Department",
        fieldName: "Department",
        type: "text",
        sortable: true,
        editable: true,
    },
    {
        label: "City",
        fieldName: "MailingCity",
        type: "text",
        sortable: true,
        editable: true,
    },
    {
        label: "State",
        fieldName: "MailingState",
        type: "text",
        sortable: true,
        editable: true,
    },
    { type: "action", typeAttributes: { rowActions: ROW_ACTIONS } },
];

// Opportunity columns
const OPPORTUNITY_COLUMNS = [
    {
        label: "Name",
        fieldName: "recordUrl",
        type: "url",
        sortable: true,
        typeAttributes: {
            label: { fieldName: "Name" },
            target: "_self",
            tooltip: { fieldName: "Name" },
        },
    },
    {
        label: "Stage",
        fieldName: "StageName",
        type: "text",
        sortable: true,
        editable: true,
    },
    {
        label: "Amount",
        fieldName: "Amount",
        type: "currency",
        sortable: true,
        editable: true,
        typeAttributes: { currencyCode: "USD" },
        cellAttributes: { alignment: "left" },
    },
    {
        label: "Close Date",
        fieldName: "CloseDate",
        type: "date-local",
        sortable: true,
        editable: true,
        typeAttributes: { month: "short", day: "2-digit", year: "numeric" },
    },
    {
        label: "Probability (%)",
        fieldName: "Probability",
        type: "percent",
        sortable: true,
        editable: true,
        typeAttributes: { maximumFractionDigits: 0 },
    },
    {
        label: "Type",
        fieldName: "Type",
        type: "text",
        sortable: true,
        editable: true,
    },
    {
        label: "Next Step",
        fieldName: "NextStep",
        type: "text",
        sortable: true,
        editable: true,
    },
    { type: "action", typeAttributes: { rowActions: ROW_ACTIONS } },
];

export default class AccountRelatedRecords extends NavigationMixin(
    LightningElement,
) {
    // ---- PUBLIC API ----
    @api recordId;

    // ---- COLUMN DEFS ----
    contactColumns = CONTACT_COLUMNS;
    opportunityColumns = OPPORTUNITY_COLUMNS;

    // ---- PAGINATED DATA (normal browsing mode) ----
    _paginatedContacts = [];
    _paginatedOpportunities = [];

    // ---- SEARCH RESULTS (search mode) ----
    _searchContacts = [];
    _searchOpportunities = [];

    // ---- LDS ACCOUNT RECORD ----
    _accountRecord;

    // ---- TOTAL COUNTS (for badges) ----
    totalContactCount = 0;
    totalOpportunityCount = 0;

    // ---- PAGINATION STATE ----
    _contactOffset = 0;
    _opportunityOffset = 0;
    enableContactInfiniteLoading = true;
    enableOpportunityInfiniteLoading = true;

    // ---- DRAFT VALUES ----
    contactDraftValues = [];
    opportunityDraftValues = [];

    // ---- LOADING / ERROR ----
    isLoading = true;
    contactError;
    opportunityError;
    isSaving = false;

    // ---- SEARCH STATE ----
    contactSearchTerm = "";
    opportunitySearchTerm = "";
    _isContactSearching = false;
    _isOpportunitySearching = false;
    _contactDebounceTimer;
    _opportunityDebounceTimer;

    // ---- UI STATE ----
    activeTab = "contacts";
    contactSortBy;
    contactSortDirection;
    opportunitySortBy;
    opportunitySortDirection;

    // ---- FLAGS to prevent duplicate loadmore calls ----
    _contactsLoading = false;
    _opportunitiesLoading = false;

    // =========================================================
    //  LDS WIRE: Account Info
    // =========================================================
    @wire(getRecord, { recordId: "$recordId", fields: ACCOUNT_FIELDS })
    wiredAccount({ data, error }) {
        if (data) {
            this._accountRecord = data;
        } else if (error) {
            console.error("Error loading account info:", error);
        }
    }

    // =====================
    //  LIFECYCLE
    // =====================
    connectedCallback() {
        this._loadInitialData();
    }

    disconnectedCallback() {
        // Clean up debounce timers
        clearTimeout(this._contactDebounceTimer);
        clearTimeout(this._opportunityDebounceTimer);
    }

    async _loadInitialData() {
        this.isLoading = true;
        try {
            const [
                contactsResult,
                opportunitiesResult,
                contactCount,
                oppCount,
            ] = await Promise.all([
                getRelatedContacts({
                    accountId: this.recordId,
                    pageSize: PAGE_SIZE,
                    offsetVal: 0,
                }),
                getRelatedOpportunities({
                    accountId: this.recordId,
                    pageSize: PAGE_SIZE,
                    offsetVal: 0,
                }),
                getContactCount({ accountId: this.recordId }),
                getOpportunityCount({ accountId: this.recordId }),
            ]);

            this._paginatedContacts = this._addRecordUrls(contactsResult);
            this._paginatedOpportunities =
                this._addRecordUrls(opportunitiesResult);
            this.totalContactCount = contactCount;
            this.totalOpportunityCount = oppCount;

            this._contactOffset = contactsResult.length;
            this._opportunityOffset = opportunitiesResult.length;

            this.enableContactInfiniteLoading =
                contactsResult.length >= PAGE_SIZE;
            this.enableOpportunityInfiniteLoading =
                opportunitiesResult.length >= PAGE_SIZE;

            this.contactError = undefined;
            this.opportunityError = undefined;
        } catch (error) {
            this.contactError = error;
            this.opportunityError = error;
        } finally {
            this.isLoading = false;
        }
    }

    // =============================
    //  COMPUTED: Which data to show
    //  Search mode → search results
    //  Normal mode → paginated data
    // =============================

    /**
     * The datatable shows either search results OR paginated data,
     * never both. This keeps the two concerns cleanly separated.
     */
    get displayedContacts() {
        return this._isContactSearchActive
            ? this._searchContacts
            : this._paginatedContacts;
    }

    get displayedOpportunities() {
        return this._isOpportunitySearchActive
            ? this._searchOpportunities
            : this._paginatedOpportunities;
    }

    // Is a search active? (non-empty search term)
    get _isContactSearchActive() {
        return (
            this.contactSearchTerm && this.contactSearchTerm.trim().length > 0
        );
    }

    get _isOpportunitySearchActive() {
        return (
            this.opportunitySearchTerm &&
            this.opportunitySearchTerm.trim().length > 0
        );
    }

    // =============================
    //  SERVER-SIDE SEARCH
    //  300ms debounce → Apex LIKE query → all matching records
    // =============================

    handleContactSearch(event) {
        const value = event.target.value;
        this.contactSearchTerm = value;

        clearTimeout(this._contactDebounceTimer);

        if (!value || !value.trim()) {
            // Cleared search — show paginated data again
            this._searchContacts = [];
            this._isContactSearching = false;
            return;
        }

        // Debounce: wait 300ms after user stops typing
        this._contactDebounceTimer = setTimeout(() => {
            this._executeContactSearch(value.trim());
        }, SEARCH_DEBOUNCE_MS);
    }

    handleOpportunitySearch(event) {
        const value = event.target.value;
        this.opportunitySearchTerm = value;

        clearTimeout(this._opportunityDebounceTimer);

        if (!value || !value.trim()) {
            this._searchOpportunities = [];
            this._isOpportunitySearching = false;
            return;
        }

        this._opportunityDebounceTimer = setTimeout(() => {
            this._executeOpportunitySearch(value.trim());
        }, SEARCH_DEBOUNCE_MS);
    }

    async _executeContactSearch(term) {
        this._isContactSearching = true;
        try {
            const result = await searchContacts({
                accountId: this.recordId,
                searchTerm: term,
            });
            // Only update if the search term hasn't changed since we started
            if (this.contactSearchTerm.trim() === term) {
                this._searchContacts = this._addRecordUrls(result);
            }
        } catch (error) {
            console.error("Error searching contacts:", error);
            this._searchContacts = [];
        } finally {
            this._isContactSearching = false;
        }
    }

    async _executeOpportunitySearch(term) {
        this._isOpportunitySearching = true;
        try {
            const result = await searchOpportunities({
                accountId: this.recordId,
                searchTerm: term,
            });
            if (this.opportunitySearchTerm.trim() === term) {
                this._searchOpportunities = this._addRecordUrls(result);
            }
        } catch (error) {
            console.error("Error searching opportunities:", error);
            this._searchOpportunities = [];
        } finally {
            this._isOpportunitySearching = false;
        }
    }

    // =============================
    //  INFINITE LOADING (only in paginated mode, disabled during search)
    // =============================

    async handleContactLoadMore(event) {
        // Don't load more during search — search shows all results
        if (this._isContactSearchActive || this._contactsLoading) return;
        this._contactsLoading = true;

        const datatableTarget = event.target;
        datatableTarget.isLoading = true;

        try {
            const result = await getRelatedContacts({
                accountId: this.recordId,
                pageSize: PAGE_SIZE,
                offsetVal: this._contactOffset,
            });

            const newRecords = this._addRecordUrls(result);
            this._paginatedContacts = [
                ...this._paginatedContacts,
                ...newRecords,
            ];
            this._contactOffset += result.length;

            if (result.length < PAGE_SIZE) {
                this.enableContactInfiniteLoading = false;
            }
        } catch (error) {
            console.error("Error loading more contacts:", error);
            this.enableContactInfiniteLoading = false;
        } finally {
            datatableTarget.isLoading = false;
            this._contactsLoading = false;
        }
    }

    async handleOpportunityLoadMore(event) {
        if (this._isOpportunitySearchActive || this._opportunitiesLoading)
            return;
        this._opportunitiesLoading = true;

        const datatableTarget = event.target;
        datatableTarget.isLoading = true;

        try {
            const result = await getRelatedOpportunities({
                accountId: this.recordId,
                pageSize: PAGE_SIZE,
                offsetVal: this._opportunityOffset,
            });

            const newRecords = this._addRecordUrls(result);
            this._paginatedOpportunities = [
                ...this._paginatedOpportunities,
                ...newRecords,
            ];
            this._opportunityOffset += result.length;

            if (result.length < PAGE_SIZE) {
                this.enableOpportunityInfiniteLoading = false;
            }
        } catch (error) {
            console.error("Error loading more opportunities:", error);
            this.enableOpportunityInfiniteLoading = false;
        } finally {
            datatableTarget.isLoading = false;
            this._opportunitiesLoading = false;
        }
    }

    // =============================
    //  COMPUTED PROPERTIES
    // =============================

    get accountName() {
        return (
            getFieldValue(this._accountRecord, ACCOUNT_NAME_FIELD) || "Account"
        );
    }

    get accountIndustry() {
        return (
            getFieldValue(this._accountRecord, ACCOUNT_INDUSTRY_FIELD) || "—"
        );
    }

    get accountPhone() {
        return getFieldValue(this._accountRecord, ACCOUNT_PHONE_FIELD) || "—";
    }

    get accountWebsite() {
        return getFieldValue(this._accountRecord, ACCOUNT_WEBSITE_FIELD) || "—";
    }

    get contactCount() {
        return this.displayedContacts?.length || 0;
    }

    get opportunityCount() {
        return this.displayedOpportunities?.length || 0;
    }

    get hasContacts() {
        return this.displayedContacts && this.displayedContacts.length > 0;
    }

    get hasOpportunities() {
        return (
            this.displayedOpportunities &&
            this.displayedOpportunities.length > 0
        );
    }

    get showContactEmptyState() {
        return (
            !this.hasContacts &&
            !this.hasContactError &&
            !this._isContactSearching
        );
    }

    get showOpportunityEmptyState() {
        return (
            !this.hasOpportunities &&
            !this.hasOpportunityError &&
            !this._isOpportunitySearching
        );
    }

    get isContactsTab() {
        return this.activeTab === "contacts";
    }

    get isOpportunitiesTab() {
        return this.activeTab === "opportunities";
    }

    get contactTabClass() {
        return `tab-button ${this.isContactsTab ? "active" : ""}`;
    }

    get opportunityTabClass() {
        return `tab-button ${this.isOpportunitiesTab ? "active" : ""}`;
    }

    get contactBadge() {
        return `${this.totalContactCount}`;
    }

    get opportunityBadge() {
        return `${this.totalOpportunityCount}`;
    }

    get hasContactError() {
        return !!this.contactError;
    }

    get hasOpportunityError() {
        return !!this.opportunityError;
    }

    get contactErrorMessage() {
        return (
            this.contactError?.body?.message || "Unknown error loading contacts"
        );
    }

    get opportunityErrorMessage() {
        return (
            this.opportunityError?.body?.message ||
            "Unknown error loading opportunities"
        );
    }

    // Disable infinite loading during search (search returns all results)
    get contactInfiniteLoadingEnabled() {
        if (this._isContactSearchActive) return false;
        return this.enableContactInfiniteLoading;
    }

    get opportunityInfiniteLoadingEnabled() {
        if (this._isOpportunitySearchActive) return false;
        return this.enableOpportunityInfiniteLoading;
    }

    // =============================
    //  EVENT HANDLERS
    // =============================

    handleTabClick(event) {
        this.activeTab = event.currentTarget.dataset.tab;
    }

    // --- Row Actions ---
    handleContactRowAction(event) {
        this._handleRowAction(event, "contact");
    }

    handleOpportunityRowAction(event) {
        this._handleRowAction(event, "opportunity");
    }

    async _handleRowAction(event, objectType) {
        const action = event.detail.action;
        const row = event.detail.row;

        switch (action.name) {
            case "view":
                this[NavigationMixin.Navigate]({
                    type: "standard__recordPage",
                    attributes: {
                        recordId: row.Id,
                        actionName: "view",
                    },
                });
                break;

            case "delete":
                await this._deleteRow(row, objectType);
                break;

            default:
                break;
        }
    }

    // =========================================================
    //  LDS DELETE
    // =========================================================
    async _deleteRow(row, objectType) {
        this.isSaving = true;
        try {
            await deleteRecord(row.Id);

            this.dispatchEvent(
                new ShowToastEvent({
                    title: "Deleted",
                    message: `${row.Name || "Record"} has been deleted`,
                    variant: "success",
                }),
            );

            // If we're in search mode, re-run search. Otherwise reload paginated data.
            if (objectType === "contact") {
                if (this._isContactSearchActive) {
                    await this._executeContactSearch(
                        this.contactSearchTerm.trim(),
                    );
                }
                await this._reloadData("contact");
            } else {
                if (this._isOpportunitySearchActive) {
                    await this._executeOpportunitySearch(
                        this.opportunitySearchTerm.trim(),
                    );
                }
                await this._reloadData("opportunity");
            }
        } catch (error) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: "Error Deleting Record",
                    message:
                        error.body?.message || "An unexpected error occurred",
                    variant: "error",
                }),
            );
        } finally {
            this.isSaving = false;
        }
    }

    // =========================================================
    //  LDS UPDATE
    // =========================================================
    async handleContactSave(event) {
        const draftValues = event.detail.draftValues;
        this.isSaving = true;

        try {
            const updatePromises = draftValues.map((draft) => {
                const fields = { ...draft };
                return updateRecord({ fields });
            });
            await Promise.all(updatePromises);

            const recordIds = draftValues.map((d) => ({ recordId: d.Id }));
            await notifyRecordUpdateAvailable(recordIds);

            this.dispatchEvent(
                new ShowToastEvent({
                    title: "Success",
                    message: `${draftValues.length} contact(s) updated successfully`,
                    variant: "success",
                }),
            );

            this.contactDraftValues = [];

            // Re-run search if active, and reload paginated data + count
            if (this._isContactSearchActive) {
                await this._executeContactSearch(this.contactSearchTerm.trim());
            }
            await this._reloadData("contact");
        } catch (error) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: "Error Updating Contacts",
                    message:
                        error.body?.message || "An unexpected error occurred",
                    variant: "error",
                }),
            );
        } finally {
            this.isSaving = false;
        }
    }

    async handleOpportunitySave(event) {
        const draftValues = event.detail.draftValues;
        this.isSaving = true;

        try {
            const updatePromises = draftValues.map((draft) => {
                const fields = { ...draft };
                return updateRecord({ fields });
            });
            await Promise.all(updatePromises);

            const recordIds = draftValues.map((d) => ({ recordId: d.Id }));
            await notifyRecordUpdateAvailable(recordIds);

            this.dispatchEvent(
                new ShowToastEvent({
                    title: "Success",
                    message: `${draftValues.length} opportunity(ies) updated successfully`,
                    variant: "success",
                }),
            );

            this.opportunityDraftValues = [];

            if (this._isOpportunitySearchActive) {
                await this._executeOpportunitySearch(
                    this.opportunitySearchTerm.trim(),
                );
            }
            await this._reloadData("opportunity");
        } catch (error) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: "Error Updating Opportunities",
                    message:
                        error.body?.message || "An unexpected error occurred",
                    variant: "error",
                }),
            );
        } finally {
            this.isSaving = false;
        }
    }

    // --- Sorting ---
    handleContactSort(event) {
        const { fieldName, sortDirection } = event.detail;
        this.contactSortBy = fieldName;
        this.contactSortDirection = sortDirection;
        const sortField = fieldName === "recordUrl" ? "Name" : fieldName;

        if (this._isContactSearchActive) {
            this._searchContacts = this._sortData(
                [...this._searchContacts],
                sortField,
                sortDirection,
            );
        } else {
            this._paginatedContacts = this._sortData(
                [...this._paginatedContacts],
                sortField,
                sortDirection,
            );
        }
    }

    handleOpportunitySort(event) {
        const { fieldName, sortDirection } = event.detail;
        this.opportunitySortBy = fieldName;
        this.opportunitySortDirection = sortDirection;
        const sortField = fieldName === "recordUrl" ? "Name" : fieldName;

        if (this._isOpportunitySearchActive) {
            this._searchOpportunities = this._sortData(
                [...this._searchOpportunities],
                sortField,
                sortDirection,
            );
        } else {
            this._paginatedOpportunities = this._sortData(
                [...this._paginatedOpportunities],
                sortField,
                sortDirection,
            );
        }
    }

    // --- Refresh ---
    async handleRefresh() {
        this.isLoading = true;
        try {
            this._paginatedContacts = [];
            this._paginatedOpportunities = [];
            this._searchContacts = [];
            this._searchOpportunities = [];
            this._contactOffset = 0;
            this._opportunityOffset = 0;
            this.enableContactInfiniteLoading = true;
            this.enableOpportunityInfiniteLoading = true;
            this.contactSearchTerm = "";
            this.opportunitySearchTerm = "";

            await this._loadInitialData();

            this.dispatchEvent(
                new ShowToastEvent({
                    title: "Refreshed",
                    message: "Data has been refreshed",
                    variant: "success",
                }),
            );
        } catch (error) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: "Refresh Failed",
                    message: error.body?.message || "Could not refresh data",
                    variant: "error",
                }),
            );
        } finally {
            this.isLoading = false;
        }
    }

    handleContactCancel() {
        this.contactDraftValues = [];
    }

    handleOpportunityCancel() {
        this.opportunityDraftValues = [];
    }

    // =============================
    //  PRIVATE HELPERS
    // =============================

    async _reloadData(objectType) {
        if (objectType === "contact") {
            const currentCount = this._contactOffset;
            const [result, count] = await Promise.all([
                getRelatedContacts({
                    accountId: this.recordId,
                    pageSize: currentCount,
                    offsetVal: 0,
                }),
                getContactCount({ accountId: this.recordId }),
            ]);
            this._paginatedContacts = this._addRecordUrls(result);
            this.totalContactCount = count;
            this._contactOffset = result.length;
            this.enableContactInfiniteLoading = result.length >= currentCount;
        } else {
            const currentCount = this._opportunityOffset;
            const [result, count] = await Promise.all([
                getRelatedOpportunities({
                    accountId: this.recordId,
                    pageSize: currentCount,
                    offsetVal: 0,
                }),
                getOpportunityCount({ accountId: this.recordId }),
            ]);
            this._paginatedOpportunities = this._addRecordUrls(result);
            this.totalOpportunityCount = count;
            this._opportunityOffset = result.length;
            this.enableOpportunityInfiniteLoading =
                result.length >= currentCount;
        }
    }

    _addRecordUrls(records) {
        return records.map((record) => ({
            ...record,
            recordUrl: "/" + record.Id,
        }));
    }

    _sortData(data, fieldName, sortDirection) {
        const isReverse = sortDirection === "desc" ? -1 : 1;
        return data.sort((a, b) => {
            let valueA = a[fieldName] || "";
            let valueB = b[fieldName] || "";

            if (typeof valueA === "string") {
                valueA = valueA.toLowerCase();
                valueB = (valueB || "").toLowerCase();
            }

            if (valueA > valueB) return isReverse;
            if (valueA < valueB) return -isReverse;
            return 0;
        });
    }
}
