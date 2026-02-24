# Account Related Records — Lightning Web Component

A production-grade Salesforce LWC that displays related **Contacts** and **Opportunities** for an Account record, featuring server-side pagination, server-side search, inline editing, row actions, and Lightning Data Service (LDS) integration.

---

## ✨ Features

| Feature                    | Description                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------- |
| **Server-Side Pagination** | SOQL `OFFSET`/`LIMIT` — loads 50 records at a time as you scroll                       |
| **Infinite Loading**       | `lightning-datatable` with `enable-infinite-loading` and fixed-height scroll container |
| **Server-Side Search**     | Apex LIKE query across multiple fields with 300ms debounce                             |
| **Inline Editing**         | Edit fields directly in the datatable, save with LDS `updateRecord`                    |
| **Row Actions**            | View Record (NavigationMixin) and Delete (LDS `deleteRecord`)                          |
| **Clickable Names**        | Record names are URL links that navigate to the record page                            |
| **LDS Integration**        | `getRecord`, `updateRecord`, `deleteRecord`, `notifyRecordUpdateAvailable`             |
| **Account Info Header**    | Displays Account Name, Industry, Phone, Website via LDS `getRecord`                    |
| **Summary Cards**          | Shows total Contact and Opportunity counts                                             |
| **Tabbed Interface**       | Switch between Contacts and Opportunities tabs                                         |
| **Client-Side Sorting**    | Sort any column ascending/descending                                                   |
| **Error Handling**         | Toast notifications for success, error, and delete operations                          |
| **Responsive Design**      | Mobile-friendly layout with grid-based summary cards                                   |

---

## 🏗️ Architecture

### LDS vs Custom Apex — When to Use What

```
┌──────────────────────┬───────────────────────────────────────────────┐
│ LDS (uiRecordApi)    │ Single-record CRUD:                           │
│                      │ • getRecord — Account info (cached, reactive) │
│                      │ • updateRecord — inline edit save             │
│                      │ • deleteRecord — row action delete            │
│                      │ • notifyRecordUpdateAvailable                 │
├──────────────────────┼───────────────────────────────────────────────┤
│ Custom Apex          │ Complex queries LDS can't do:                 │
│                      │ • OFFSET/LIMIT pagination                    │
│                      │ • Server-side LIKE search                    │
│                      │ • COUNT() aggregations                       │
└──────────────────────┴───────────────────────────────────────────────┘
```

### Infinite Loading — How It Works

`lightning-datatable`'s `loadmore` event requires a **fixed-height container** with internal scrolling. Without it, the table expands to fit all rows, no scrollbar appears, and `loadmore` fires in a rapid loop loading everything at once.

```css
.datatable-wrapper {
    height: 400px; /* Fixed height = scroll container */
    overflow: auto; /* Internal scrollbar */
}
```

### Search — Server-Side with Debounce

```
User types → 300ms debounce → Apex LIKE query → ALL matching records returned
User clears → Paginated view restored with infinite loading re-enabled
```

---

## 📁 Project Structure

```
force-app/main/default/
├── classes/
│   ├── AccountRelatedRecordsController.cls          # Apex controller
│   ├── AccountRelatedRecordsController.cls-meta.xml
│   ├── AccountRelatedRecordsControllerTest.cls      # Test class (13 methods)
│   └── AccountRelatedRecordsControllerTest.cls-meta.xml
└── lwc/
    └── accountRelatedRecords/
        ├── accountRelatedRecords.js                  # JS controller
        ├── accountRelatedRecords.html                # Template
        ├── accountRelatedRecords.css                 # Styles
        └── accountRelatedRecords.js-meta.xml         # Metadata

scripts/
└── createTestData.apex    # Anonymous Apex: creates 500 Contacts + 500 Opportunities
```

---

## 🚀 Deployment

### Prerequisites

- Salesforce CLI (`sfdx`)
- An authenticated org

### Deploy

```bash
sfdx force:source:deploy -p force-app/main/default/classes/AccountRelatedRecordsController.cls,force-app/main/default/classes/AccountRelatedRecordsControllerTest.cls,force-app/main/default/lwc/accountRelatedRecords -u <your-org-alias>
```

### Generate Test Data (Optional)

```bash
sfdx force:apex:execute -f scripts/createTestData.apex -u <your-org-alias>
```

Creates 1 Account (`Publicis Demo Account __ARR_TEST_2026__`) + 500 Contacts + 500 Opportunities.

### Cleanup Test Data

```apex
Account acc = [SELECT Id FROM Account WHERE Name LIKE '%__ARR_TEST_2026__%' LIMIT 1];
delete acc;  // Cascade-deletes all child records
```

### Add Component to Page

1. Navigate to any Account record page
2. Click ⚙️ → **Edit Page** (Lightning App Builder)
3. Drag **Account Related Records** onto the page
4. Save and activate

---

## 🧪 Apex Controller Methods

| Method                                                    | Type | Purpose                                                         |
| --------------------------------------------------------- | ---- | --------------------------------------------------------------- |
| `getRelatedContacts(accountId, pageSize, offsetVal)`      | Apex | Paginated Contact fetch                                         |
| `getRelatedOpportunities(accountId, pageSize, offsetVal)` | Apex | Paginated Opportunity fetch                                     |
| `getContactCount(accountId)`                              | Apex | Total Contact count for badge                                   |
| `getOpportunityCount(accountId)`                          | Apex | Total Opportunity count for badge                               |
| `searchContacts(accountId, searchTerm)`                   | Apex | SOQL LIKE search across Name, Email, Phone, Title, Department   |
| `searchOpportunities(accountId, searchTerm)`              | Apex | SOQL LIKE search across Name, StageName, Type                   |
| `updateRecords(records)`                                  | Apex | Bulk SObject update (kept for backward compatibility)           |
| `getAccountInfo(accountId)`                               | Apex | Account details (superseded by LDS `getRecord` in LWC)          |
| `deleteRecord(recordId)`                                  | Apex | Generic record delete (superseded by LDS `deleteRecord` in LWC) |

---

## 🔑 Key Design Decisions

1. **LDS for single-record CRUD** — automatic caching, FLS enforcement, cross-component sync
2. **Apex for complex queries** — pagination, search, aggregation (LDS can't do these)
3. **Schema imports** (`@salesforce/schema`) — compile-time field validation, survives field renames
4. **Server-side search** — queries ALL records in DB, not just loaded ones
5. **Fixed-height datatable** — required for `enable-infinite-loading` to work correctly
6. **Debounced search** — 300ms delay prevents excessive Apex calls while typing
7. **`with sharing`** — enforces record-level security in Apex
8. **`String.escapeSingleQuotes`** — prevents SOQL injection in search

---

## 📄 License

MIT
