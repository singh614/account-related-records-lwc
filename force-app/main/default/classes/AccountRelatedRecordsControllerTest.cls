/**
 * @description Test class for AccountRelatedRecordsController.
 *              Covers all Apex methods:
 *              - getRelatedContacts / getRelatedOpportunities (pagination)
 *              - getContactCount / getOpportunityCount (aggregation)
 *              - searchContacts / searchOpportunities (server-side search)
 *              - updateRecords (bulk SObject update)
 *              - deleteRecord (generic record deletion)
 *              - getAccountInfo (Account details)
 * 
 * @author      Abhinandan Singh
 * @since       2026-02-24
 */
@isTest
private class AccountRelatedRecordsControllerTest {

    @TestSetup
    static void setupTestData() {
        // Create test Account
        Account testAccount = new Account(
            Name = 'Test Account',
            Industry = 'Technology',
            Phone = '1234567890',
            Website = 'www.test.com'
        );
        insert testAccount;

        // Create 10 test Contacts
        List<Contact> contacts = new List<Contact>();
        for (Integer i = 0; i < 10; i++) {
            contacts.add(new Contact(
                FirstName = 'Test',
                LastName = 'Contact ' + i,
                Email = 'test' + i + '@test.com',
                Phone = '123456789' + i,
                Title = 'Manager',
                Department = 'Sales',
                AccountId = testAccount.Id
            ));
        }
        insert contacts;

        // Create 10 test Opportunities
        List<Opportunity> opportunities = new List<Opportunity>();
        for (Integer i = 0; i < 10; i++) {
            opportunities.add(new Opportunity(
                Name = 'Test Opportunity ' + i,
                StageName = 'Prospecting',
                CloseDate = Date.today().addDays(30 + i),
                Amount = 1000 * (i + 1),
                Probability = 50,
                AccountId = testAccount.Id
            ));
        }
        insert opportunities;
    }

    @isTest
    static void testGetRelatedContacts() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        
        Test.startTest();
        // Fetch first page (all 10 records fit in one page)
        List<Contact> contacts = AccountRelatedRecordsController.getRelatedContacts(acc.Id, 50, 0);
        Test.stopTest();

        System.assertEquals(10, contacts.size(), 'Should return 10 contacts');
        System.assert(contacts[0].Name <= contacts[1].Name, 'Contacts should be ordered by Name ASC');
    }

    @isTest
    static void testGetRelatedContactsPagination() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        
        Test.startTest();
        List<Contact> page1 = AccountRelatedRecordsController.getRelatedContacts(acc.Id, 5, 0);
        List<Contact> page2 = AccountRelatedRecordsController.getRelatedContacts(acc.Id, 5, 5);
        List<Contact> page3 = AccountRelatedRecordsController.getRelatedContacts(acc.Id, 5, 10);
        Test.stopTest();

        System.assertEquals(5, page1.size(), 'Page 1 should return 5 contacts');
        System.assertEquals(5, page2.size(), 'Page 2 should return 5 contacts');
        System.assertEquals(0, page3.size(), 'Page 3 should return 0 contacts (no more data)');
    }

    @isTest
    static void testGetRelatedOpportunities() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        
        Test.startTest();
        List<Opportunity> opps = AccountRelatedRecordsController.getRelatedOpportunities(acc.Id, 50, 0);
        Test.stopTest();

        System.assertEquals(10, opps.size(), 'Should return 10 opportunities');
        System.assert(opps[0].CloseDate >= opps[1].CloseDate, 'Opportunities should be ordered by CloseDate DESC');
    }

    @isTest
    static void testUpdateRecords() {
        List<Contact> contacts = [SELECT Id, LastName FROM Contact LIMIT 2];
        contacts[0].LastName = 'Updated Contact 0';
        contacts[1].LastName = 'Updated Contact 1';

        Test.startTest();
        String result = AccountRelatedRecordsController.updateRecords(contacts);
        Test.stopTest();

        System.assertEquals('Records updated successfully', result);
        
        Contact updated = [SELECT LastName FROM Contact WHERE Id = :contacts[0].Id];
        System.assertEquals('Updated Contact 0', updated.LastName);
    }

    @isTest
    static void testUpdateRecordsError() {
        // Try updating with an invalid record to trigger DmlException
        List<Contact> contacts = new List<Contact>();
        contacts.add(new Contact(Id = null, LastName = 'Bad')); // null Id should fail

        Test.startTest();
        try {
            AccountRelatedRecordsController.updateRecords(contacts);
            System.assert(false, 'Should have thrown an exception');
        } catch (Exception e) {
            System.assert(e.getMessage() != null, 'Error message should not be null');
        }
        Test.stopTest();
    }

    @isTest
    static void testGetAccountInfo() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        
        Test.startTest();
        Account result = AccountRelatedRecordsController.getAccountInfo(acc.Id);
        Test.stopTest();

        System.assertEquals('Test Account', result.Name);
        System.assertEquals('Technology', result.Industry);
    }

    @isTest
    static void testDeleteRecord() {
        Contact con = [SELECT Id FROM Contact LIMIT 1];
        Integer beforeCount = [SELECT COUNT() FROM Contact];

        Test.startTest();
        String result = AccountRelatedRecordsController.deleteRecord(con.Id);
        Test.stopTest();

        System.assertEquals('Record deleted successfully', result);
        Integer afterCount = [SELECT COUNT() FROM Contact];
        System.assertEquals(beforeCount - 1, afterCount, 'Contact count should decrease by 1');
    }

    @isTest
    static void testDeleteOpportunityRecord() {
        Opportunity opp = [SELECT Id FROM Opportunity LIMIT 1];
        Integer beforeCount = [SELECT COUNT() FROM Opportunity];

        Test.startTest();
        String result = AccountRelatedRecordsController.deleteRecord(opp.Id);
        Test.stopTest();

        System.assertEquals('Record deleted successfully', result);
        Integer afterCount = [SELECT COUNT() FROM Opportunity];
        System.assertEquals(beforeCount - 1, afterCount, 'Opportunity count should decrease by 1');
    }

    @isTest
    static void testGetContactCount() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        
        Test.startTest();
        Integer count = AccountRelatedRecordsController.getContactCount(acc.Id);
        Test.stopTest();

        System.assertEquals(10, count, 'Should return 10 as contact count');
    }

    @isTest
    static void testGetOpportunityCount() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        
        Test.startTest();
        Integer count = AccountRelatedRecordsController.getOpportunityCount(acc.Id);
        Test.stopTest();

        System.assertEquals(10, count, 'Should return 10 as opportunity count');
    }

    @isTest
    static void testSearchContacts() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        
        Test.startTest();
        List<Contact> results = AccountRelatedRecordsController.searchContacts(acc.Id, 'Contact 0');
        Test.stopTest();

        System.assert(results.size() > 0, 'Should find at least one contact matching "Contact 0"');
        for (Contact c : results) {
            System.assert(
                c.Name.containsIgnoreCase('Contact 0') || 
                (c.Email != null && c.Email.containsIgnoreCase('Contact 0')),
                'Each result should match the search term'
            );
        }
    }

    @isTest
    static void testSearchContactsNoMatch() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        
        Test.startTest();
        List<Contact> results = AccountRelatedRecordsController.searchContacts(acc.Id, 'ZZZZNONEXISTENT');
        Test.stopTest();

        System.assertEquals(0, results.size(), 'Should return 0 for non-matching search');
    }

    @isTest
    static void testSearchOpportunities() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        
        Test.startTest();
        List<Opportunity> results = AccountRelatedRecordsController.searchOpportunities(acc.Id, 'Prospecting');
        Test.stopTest();

        System.assert(results.size() > 0, 'Should find opportunities with stage "Prospecting"');
    }

    @isTest
    static void testSearchOpportunitiesNoMatch() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        
        Test.startTest();
        List<Opportunity> results = AccountRelatedRecordsController.searchOpportunities(acc.Id, 'ZZZZNONEXISTENT');
        Test.stopTest();

        System.assertEquals(0, results.size(), 'Should return 0 for non-matching search');
    }
}
