/**
 * @description Controller for the Account Related Records LWC component.
 *              Retrieves related Contacts and Opportunities for a given Account
 *              with server-side offset pagination, inline editing, and delete.
 * 
 * @author      Abhinandan Singh
 * @since       2026-02-24
 * 
 * INTERVIEW TALKING POINTS:
 * - Server-side OFFSET/LIMIT pagination for efficient data loading
 * - NOT cacheable — imperative calls from LWC for pagination control
 * - Separate count methods return total records for UI badges
 * - Using List<SObject> for updates to handle any object generically
 * - SOQL ORDER BY ensures consistent pagination (no skipped/duplicate rows)
 * - String.escapeSingleQuotes() used in search to prevent SOQL injection
 * - 'with sharing' enforces record-level security (respects sharing rules)
 */
public with sharing class AccountRelatedRecordsController {

    /**
     * @description Fetches a page of related Contacts with OFFSET pagination.
     *              NOT cacheable so the LWC can call imperatively with changing offset.
     * @param accountId The Id of the parent Account record
     * @param pageSize  Number of records to return per page
     * @param offset    Number of records to skip (for pagination)
     * @return List of Contact records for the requested page
     */
    @AuraEnabled
    public static List<Contact> getRelatedContacts(Id accountId, Integer pageSize, Integer offsetVal) {
        return [
            SELECT Id, FirstName, LastName, Name, Email, Phone, 
                   Title, Department, MailingCity, MailingState,
                   CreatedDate, LastModifiedDate
            FROM Contact
            WHERE AccountId = :accountId
            ORDER BY Name ASC
            LIMIT :pageSize
            OFFSET :offsetVal
        ];
    }

    /**
     * @description Fetches a page of related Opportunities with OFFSET pagination.
     * @param accountId The Id of the parent Account record
     * @param pageSize  Number of records to return per page
     * @param offset    Number of records to skip (for pagination)
     * @return List of Opportunity records for the requested page
     */
    @AuraEnabled
    public static List<Opportunity> getRelatedOpportunities(Id accountId, Integer pageSize, Integer offsetVal) {
        return [
            SELECT Id, Name, StageName, Amount, CloseDate, 
                   Probability, Type, LeadSource, NextStep,
                   CreatedDate, LastModifiedDate
            FROM Opportunity
            WHERE AccountId = :accountId
            ORDER BY CloseDate DESC
            LIMIT :pageSize
            OFFSET :offsetVal
        ];
    }

    /**
     * @description Returns total count of Contacts for the Account.
     *              Used for the summary badge in the UI.
     */
    @AuraEnabled
    public static Integer getContactCount(Id accountId) {
        return [SELECT COUNT() FROM Contact WHERE AccountId = :accountId];
    }

    /**
     * @description Returns total count of Opportunities for the Account.
     */
    @AuraEnabled
    public static Integer getOpportunityCount(Id accountId) {
        return [SELECT COUNT() FROM Opportunity WHERE AccountId = :accountId];
    }

    /**
     * @description Server-side search for Contacts related to an Account.
     *              Searches across Name, Email, Phone, Title, and Department.
     *              Returns ALL matching records (no pagination — search
     *              typically narrows results to a manageable set).
     * @param accountId  The parent Account Id
     * @param searchTerm The user's search input
     * @return Matching Contact records
     */
    @AuraEnabled
    public static List<Contact> searchContacts(Id accountId, String searchTerm) {
        String term = '%' + String.escapeSingleQuotes(searchTerm.trim()) + '%';
        return [
            SELECT Id, FirstName, LastName, Name, Email, Phone,
                   Title, Department, MailingCity, MailingState,
                   CreatedDate, LastModifiedDate
            FROM Contact
            WHERE AccountId = :accountId
            AND (
                Name LIKE :term
                OR Email LIKE :term
                OR Phone LIKE :term
                OR Title LIKE :term
                OR Department LIKE :term
            )
            ORDER BY Name ASC
            LIMIT 200
        ];
    }

    /**
     * @description Server-side search for Opportunities related to an Account.
     *              Searches across Name, StageName, and Type.
     * @param accountId  The parent Account Id
     * @param searchTerm The user's search input
     * @return Matching Opportunity records
     */
    @AuraEnabled
    public static List<Opportunity> searchOpportunities(Id accountId, String searchTerm) {
        String term = '%' + String.escapeSingleQuotes(searchTerm.trim()) + '%';
        return [
            SELECT Id, Name, StageName, Amount, CloseDate,
                   Probability, Type, LeadSource, NextStep,
                   CreatedDate, LastModifiedDate
            FROM Opportunity
            WHERE AccountId = :accountId
            AND (
                Name LIKE :term
                OR StageName LIKE :term
                OR Type LIKE :term
            )
            ORDER BY CloseDate DESC
            LIMIT 200
        ];
    }

    /**
     * @description Updates a list of SObject records (Contacts or Opportunities).
     *              NOT cacheable since it performs DML — must be called imperatively.
     *              Uses generic SObject to handle updates for any object type.
     * @param records List of SObject records with updated field values
     * @return String success message
     */
    @AuraEnabled
    public static String updateRecords(List<SObject> records) {
        try {
            update records;
            return 'Records updated successfully';
        } catch (DmlException e) {
            throw new AuraHandledException(
                'Error updating records: ' + e.getMessage()
            );
        }
    }

    /**
     * @description Fetches the Account name for display in the component header.
     * @param accountId The Id of the Account
     * @return The Account record with Name field
     */
    @AuraEnabled(cacheable=true)
    public static Account getAccountInfo(Id accountId) {
        return [
            SELECT Id, Name, Industry, Phone, Website, 
                   NumberOfEmployees, AnnualRevenue, Type
            FROM Account
            WHERE Id = :accountId
            LIMIT 1
        ];
    }

    /**
     * @description Deletes a single record by Id.
     *              Accepts generic Id so it works for Contact, Opportunity, or any SObject.
     *              NOT cacheable since it performs DML.
     * @param recordId The Id of the record to delete
     * @return String success message
     */
    @AuraEnabled
    public static String deleteRecord(Id recordId) {
        try {
            // Get the SObject type from the Id to construct a generic delete
            SObjectType sObjType = recordId.getSObjectType();
            SObject record = sObjType.newSObject(recordId);
            delete record;
            return 'Record deleted successfully';
        } catch (DmlException e) {
            throw new AuraHandledException(
                'Error deleting record: ' + e.getMessage()
            );
        }
    }
}
