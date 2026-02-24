/**
 * Anonymous Apex Script: Create Test Data for Account Related Records Component
 * 
 * Creates:
 *   - 1 Account with unique tag __ARR_TEST_2026__ in the name
 *   - 500 Contacts related to the Account
 *   - 500 Opportunities related to the Account
 * 
 * CLEANUP QUERY (run in Dev Console or SOQL):
 *   SELECT Id, Name FROM Account WHERE Name LIKE '%__ARR_TEST_2026__%'
 *   
 * CLEANUP DELETE (Anonymous Apex):
 *   Account acc = [SELECT Id FROM Account WHERE Name LIKE '%__ARR_TEST_2026__%' LIMIT 1];
 *   // Deleting the Account will cascade-delete all child Contacts and Opportunities
 *   delete acc;
 * 
 * NOTE: 500 records per object is well within DML limits (10,000 per transaction).
 *       We batch the inserts in groups of 200 for safety.
 */

// Unique tag for easy identification and cleanup
String TAG = '__ARR_TEST_2026__';

// ---- 1. Create Account ----
Account testAccount = new Account(
    Name = 'Publicis Demo Account ' + TAG,
    Industry = 'Technology',
    Phone = '5551234567',
    Website = 'www.publicis-demo.com',
    Type = 'Customer - Direct',
    NumberOfEmployees = 5000,
    AnnualRevenue = 50000000
);
insert testAccount;
System.debug('✅ Account created: ' + testAccount.Id + ' — ' + testAccount.Name);

// ---- 2. Create 500 Contacts ----
List<Contact> contacts = new List<Contact>();
String[] firstNames = new String[]{
    'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
    'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
    'Thomas', 'Sarah', 'Christopher', 'Karen', 'Daniel', 'Lisa', 'Matthew', 'Nancy',
    'Anthony', 'Betty'
};
String[] lastNames = new String[]{
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
    'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
    'White', 'Harris', 'Sanchez'
};
String[] departments = new String[]{
    'Sales', 'Marketing', 'Engineering', 'Finance', 'HR', 'Operations', 
    'Legal', 'Support', 'Product', 'Design'
};
String[] titles = new String[]{
    'Manager', 'Director', 'VP', 'Analyst', 'Specialist', 'Coordinator',
    'Engineer', 'Consultant', 'Lead', 'Associate'
};
String[] cities = new String[]{
    'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix',
    'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'Austin'
};
String[] states = new String[]{
    'NY', 'CA', 'IL', 'TX', 'AZ', 'PA', 'TX', 'CA', 'TX', 'TX'
};

for (Integer i = 0; i < 500; i++) {
    String firstName = firstNames[Math.mod(i, firstNames.size())];
    String lastName = lastNames[Math.mod(i, lastNames.size())] + ' ' + TAG + ' ' + i;
    
    contacts.add(new Contact(
        FirstName = firstName,
        LastName = lastName,
        Email = 'contact' + i + '.arr.test@demo.com',
        Phone = '55' + String.valueOf(10000000 + i),
        Title = titles[Math.mod(i, titles.size())],
        Department = departments[Math.mod(i, departments.size())],
        MailingCity = cities[Math.mod(i, cities.size())],
        MailingState = states[Math.mod(i, states.size())],
        AccountId = testAccount.Id
    ));
}

// Insert in batches of 200
for (Integer i = 0; i < contacts.size(); i += 200) {
    Integer endIdx = Math.min(i + 200, contacts.size());
    List<Contact> batch = new List<Contact>();
    for (Integer j = i; j < endIdx; j++) {
        batch.add(contacts[j]);
    }
    insert batch;
    System.debug('✅ Contacts batch inserted: ' + i + ' to ' + (endIdx - 1));
}
System.debug('✅ Total Contacts created: ' + contacts.size());

// ---- 3. Create 500 Opportunities ----
List<Opportunity> opportunities = new List<Opportunity>();
String[] stageNames = new String[]{
    'Prospecting', 'Qualification', 'Needs Analysis', 'Value Proposition',
    'Id. Decision Makers', 'Perception Analysis', 'Proposal/Price Quote',
    'Negotiation/Review', 'Closed Won', 'Closed Lost'
};
String[] oppTypes = new String[]{
    'New Customer', 'Existing Customer - Upgrade', 'Existing Customer - Replacement',
    'Existing Customer - Downgrade'
};
String[] leadSources = new String[]{
    'Web', 'Phone Inquiry', 'Partner Referral', 'Purchased List',
    'Other', 'Trade Show', 'Employee Referral', 'External Referral'
};

for (Integer i = 0; i < 500; i++) {
    String stageName = stageNames[Math.mod(i, stageNames.size())];
    Integer probability;
    if (stageName == 'Closed Won') {
        probability = 100;
    } else if (stageName == 'Closed Lost') {
        probability = 0;
    } else {
        probability = 10 + Math.mod(i * 7, 80); // 10-89%
    }

    opportunities.add(new Opportunity(
        Name = 'Opp ' + TAG + ' ' + String.valueOf(i).leftPad(3, '0'),
        StageName = stageName,
        CloseDate = Date.today().addDays(Math.mod(i, 365) - 180), // Spread over past 6 months to future 6 months
        Amount = Math.mod(i * 137, 100000) + 1000, // $1K - $100K range
        Probability = probability,
        Type = oppTypes[Math.mod(i, oppTypes.size())],
        LeadSource = leadSources[Math.mod(i, leadSources.size())],
        NextStep = 'Follow up with stakeholder #' + i,
        AccountId = testAccount.Id
    ));
}

// Insert in batches of 200
for (Integer i = 0; i < opportunities.size(); i += 200) {
    Integer endIdx = Math.min(i + 200, opportunities.size());
    List<Opportunity> batch = new List<Opportunity>();
    for (Integer j = i; j < endIdx; j++) {
        batch.add(opportunities[j]);
    }
    insert batch;
    System.debug('✅ Opportunities batch inserted: ' + i + ' to ' + (endIdx - 1));
}
System.debug('✅ Total Opportunities created: ' + opportunities.size());

System.debug('========================================');
System.debug('✅ ALL DONE! Test data created successfully.');
System.debug('Account Id: ' + testAccount.Id);
System.debug('Account Name: ' + testAccount.Name);
System.debug('Contacts: 500');
System.debug('Opportunities: 500');
System.debug('========================================');
System.debug('🧹 CLEANUP: Delete the account to cascade-delete all children:');
System.debug('   Account acc = [SELECT Id FROM Account WHERE Name LIKE \'%__ARR_TEST_2026__%\' LIMIT 1]; delete acc;');
