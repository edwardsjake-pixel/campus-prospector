// HubSpot integration via Replit connector (connection:conn_hubspot_01KHKDJPFY8KDHJKT2SQ1RZ9SD)
import { Client } from '@hubspot/api-client';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=hubspot',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('HubSpot not connected');
  }
  return accessToken;
}

async function getUncachableHubSpotClient() {
  const accessToken = await getAccessToken();
  return new Client({ accessToken });
}

interface HubSpotContact {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
}

interface HubSpotDeal {
  id: string;
  dealName: string;
  stage: string | null;
  amount: string | null;
  closeDate: string | null;
  pipeline: string | null;
}

const SCHOOL_COMPANY_MAP: Record<string, string[]> = {
  purdue: ["Purdue University"],
  iu: ["Indiana University Bloomington", "Indiana University"],
  both: ["Purdue University", "Indiana University Bloomington", "Indiana University"],
};

function resolveCompanyNames(params: { companyNames?: string[]; school?: string }): string[] {
  if (params.companyNames && params.companyNames.length > 0) {
    return params.companyNames;
  }
  if (params.school && SCHOOL_COMPANY_MAP[params.school]) {
    return SCHOOL_COMPANY_MAP[params.school];
  }
  return SCHOOL_COMPANY_MAP['both'];
}

export interface HubSpotSyncResult {
  contactsFound: number;
  instructorsCreated: number;
  instructorsUpdated: number;
  dealsImported: number;
  errors: string[];
}

async function getCompanyName(client: Client, companyId: string): Promise<string | null> {
  try {
    const company = await client.crm.companies.basicApi.getById(companyId, ['name']);
    return company.properties.name || null;
  } catch {
    return null;
  }
}

async function getContactsForCompany(client: Client, companyId: string): Promise<HubSpotContact[]> {
  const contacts: HubSpotContact[] = [];
  let after: string | undefined;

  do {
    const response = await client.crm.associations.v4.basicApi.getPage(
      'companies',
      companyId,
      'contacts',
      after,
      100,
    );

    const contactIds = response.results.map((r: any) => r.toObjectId);

    for (const contactId of contactIds) {
      try {
        const contact = await client.crm.contacts.basicApi.getById(
          contactId,
          ['email', 'firstname', 'lastname', 'company']
        );
        contacts.push({
          id: contact.id,
          email: contact.properties.email || null,
          firstName: contact.properties.firstname || null,
          lastName: contact.properties.lastname || null,
          company: contact.properties.company || null,
        });
      } catch (e) {
        console.error(`Failed to fetch contact ${contactId}:`, e);
      }
    }

    after = response.paging?.next?.after;
  } while (after);

  return contacts;
}

async function getDealsForContact(client: Client, contactId: string): Promise<HubSpotDeal[]> {
  const deals: HubSpotDeal[] = [];

  try {
    const response = await client.crm.associations.v4.basicApi.getPage(
      'contacts',
      contactId,
      'deals',
    );

    for (const assoc of response.results) {
      const dealId = (assoc as any).toObjectId || assoc.id;
      try {
        const deal = await client.crm.deals.basicApi.getById(
          dealId,
          ['dealname', 'dealstage', 'amount', 'closedate', 'pipeline']
        );
        deals.push({
          id: deal.id,
          dealName: deal.properties.dealname || 'Untitled Deal',
          stage: deal.properties.dealstage || null,
          amount: deal.properties.amount || null,
          closeDate: deal.properties.closedate || null,
          pipeline: deal.properties.pipeline || null,
        });
      } catch (e) {
        console.error(`Failed to fetch deal ${dealId}:`, e);
      }
    }
  } catch (e) {
    console.error(`Failed to fetch deals for contact ${contactId}:`, e);
  }

  return deals;
}

async function searchCompaniesByName(client: Client, name: string): Promise<{ id: string; name: string }[]> {
  try {
    const response = await client.crm.companies.searchApi.doSearch({
      filterGroups: [{
        filters: [{
          propertyName: 'name',
          operator: 'CONTAINS_TOKEN' as any,
          value: name,
        }]
      }],
      properties: ['name'],
      limit: 50,
      after: 0 as any,
      sorts: [],
    });

    return response.results
      .filter(r => r.properties.name?.toLowerCase() === name.toLowerCase())
      .map(r => ({
        id: r.id,
        name: r.properties.name || name,
      }));
  } catch (e) {
    console.error(`Failed to search companies for "${name}":`, e);
    return [];
  }
}

export async function syncHubSpotData(
  companyNames: string[],
  storage: {
    getInstructorByEmail: (email: string) => Promise<any>;
    createInstructor: (data: any) => Promise<any>;
    updateInstructor: (id: number, data: any) => Promise<any>;
    upsertDeal: (data: any) => Promise<any>;
    findOrCreateDepartment: (instName: string, deptName: string) => Promise<any>;
  }
): Promise<HubSpotSyncResult> {
  const client = await getUncachableHubSpotClient();
  const result: HubSpotSyncResult = {
    contactsFound: 0,
    instructorsCreated: 0,
    instructorsUpdated: 0,
    dealsImported: 0,
    errors: [],
  };

  const seenContactIds = new Set<string>();
  for (const companyName of companyNames) {
    try {
      const companies = await searchCompaniesByName(client, companyName);
      if (companies.length === 0) {
        result.errors.push(`No company found matching "${companyName}"`);
        continue;
      }

      for (const company of companies) {
        const realCompanyName = await getCompanyName(client, company.id) || company.name;
        const contacts = await getContactsForCompany(client, company.id);
        result.contactsFound += contacts.length;

        const dept = await storage.findOrCreateDepartment(realCompanyName, "General");

        for (const contact of contacts) {
          if (!contact.email) continue;
          if (seenContactIds.has(contact.id)) continue;
          seenContactIds.add(contact.id);

          const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
          if (!fullName) continue;

          const existing = await storage.getInstructorByEmail(contact.email);

          let instructorId: number;
          if (existing) {
            if (!existing.departmentId) {
              await storage.updateInstructor(existing.id, {
                departmentId: dept.id,
              });
            }
            instructorId = existing.id;
            result.instructorsUpdated++;
          } else {
            const newInstructor = await storage.createInstructor({
              name: fullName,
              email: contact.email,
              departmentId: dept.id,
            });
            instructorId = newInstructor.id;
            result.instructorsCreated++;
          }

          const contactDeals = await getDealsForContact(client, contact.id);
          for (const deal of contactDeals) {
            await storage.upsertDeal({
              hubspotDealId: deal.id,
              dealName: deal.dealName,
              stage: deal.stage,
              amount: deal.amount,
              closeDate: deal.closeDate,
              pipeline: deal.pipeline,
              instructorId,
              hubspotContactId: contact.id,
            });
            result.dealsImported++;
          }
        }
      }
    } catch (e: any) {
      result.errors.push(`Error syncing "${companyName}": ${e.message}`);
    }
  }

  return result;
}

export interface HubSpotImportPreviewContact {
  hubspotContactId: string;
  name: string;
  email: string;
  company: string;
  deals: { id: string; dealName: string; stage: string | null; amount: string | null; closeDate: string | null; pipeline: string | null }[];
  totalDealValue: number;
  alreadyImported: boolean;
}

function isClosedLostStage(stageLabel: string | null): boolean {
  if (!stageLabel) return false;
  const lower = stageLabel.toLowerCase().replace(/[^a-z]/g, '');
  return lower.includes('closedlost') || lower === 'nopurchase';
}

function isClosedWonStage(stageLabel: string | null): boolean {
  if (!stageLabel) return false;
  const lower = stageLabel.toLowerCase().replace(/[^a-z]/g, '');
  return lower.includes('closedwon') || lower.includes('completepaid') || lower.includes('purchasesecured');
}

function filterDealsRecentOnly(deals: HubSpotDeal[], stageLabels: Record<string, string>): HubSpotDeal[] {
  const openDeals: HubSpotDeal[] = [];
  const closedWonDeals: HubSpotDeal[] = [];

  for (const deal of deals) {
    const label = deal.stage ? (stageLabels[deal.stage] || deal.stage) : '';
    if (isClosedLostStage(label)) continue;
    if (isClosedWonStage(label)) {
      closedWonDeals.push(deal);
    } else {
      openDeals.push(deal);
    }
  }

  closedWonDeals.sort((a, b) => {
    const dateA = a.closeDate ? new Date(a.closeDate).getTime() : 0;
    const dateB = b.closeDate ? new Date(b.closeDate).getTime() : 0;
    return dateB - dateA;
  });

  const mostRecentClosedWon = closedWonDeals.length > 0 ? [closedWonDeals[0]] : [];
  return [...openDeals, ...mostRecentClosedWon];
}

export async function fetchImportPreview(
  params: { companyNames?: string[]; school?: string },
  existingEmails: Set<string>,
  stageLabels: Record<string, string>,
  recentOnly: boolean = false,
): Promise<HubSpotImportPreviewContact[]> {
  const client = await getUncachableHubSpotClient();
  const results: HubSpotImportPreviewContact[] = [];
  const seenContactIds = new Set<string>();
  const companyNames = resolveCompanyNames(params);

  for (const companyName of companyNames) {
    try {
      const companies = await searchCompaniesByName(client, companyName);
      for (const company of companies) {
        const realCompanyName = await getCompanyName(client, company.id) || company.name;
        const contacts = await getContactsForCompany(client, company.id);

        for (const contact of contacts) {
          if (!contact.email) continue;
          if (seenContactIds.has(contact.id)) continue;
          seenContactIds.add(contact.id);

          const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
          if (!fullName) continue;

          const contactDeals = await getDealsForContact(client, contact.id);
          let filteredDeals: HubSpotDeal[];
          if (recentOnly) {
            filteredDeals = filterDealsRecentOnly(contactDeals, stageLabels);
          } else {
            filteredDeals = contactDeals.filter(d => {
              const label = d.stage ? (stageLabels[d.stage] || d.stage) : '';
              return !isClosedLostStage(label);
            });
          }

          if (filteredDeals.length === 0) continue;

          const alreadyImported = existingEmails.has(contact.email.toLowerCase());

          results.push({
            hubspotContactId: contact.id,
            name: fullName,
            email: contact.email,
            company: realCompanyName,
            deals: filteredDeals,
            totalDealValue: filteredDeals.reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
            alreadyImported,
          });
        }
      }
    } catch (e: any) {
      console.error(`Preview error for "${companyName}":`, e.message);
    }
  }

  return results;
}

export async function searchHubSpotContacts(
  params: { companyNames?: string[]; school?: string },
  searchQuery: string,
  existingEmails: Set<string>,
  stageLabels: Record<string, string>,
  recentOnly: boolean = false,
): Promise<HubSpotImportPreviewContact[]> {
  const client = await getUncachableHubSpotClient();
  const results: HubSpotImportPreviewContact[] = [];
  const seenContactIds = new Set<string>();
  const companyNames = resolveCompanyNames(params);

  for (const companyName of companyNames) {
    try {
      const companies = await searchCompaniesByName(client, companyName);
      for (const company of companies) {
        const realCompanyName = await getCompanyName(client, company.id) || company.name;
        const contacts = await getContactsForCompany(client, company.id);

        for (const contact of contacts) {
          if (!contact.email) continue;
          if (seenContactIds.has(contact.id)) continue;
          seenContactIds.add(contact.id);

          const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
          if (!fullName) continue;

          const queryLower = searchQuery.toLowerCase();
          if (!fullName.toLowerCase().includes(queryLower) && !contact.email.toLowerCase().includes(queryLower)) {
            continue;
          }

          const contactDeals = await getDealsForContact(client, contact.id);
          let filteredDeals: HubSpotDeal[];
          if (recentOnly) {
            filteredDeals = filterDealsRecentOnly(contactDeals, stageLabels);
          } else {
            filteredDeals = contactDeals.filter(d => {
              const label = d.stage ? (stageLabels[d.stage] || d.stage) : '';
              return !isClosedLostStage(label);
            });
          }

          const alreadyImported = existingEmails.has(contact.email.toLowerCase());

          results.push({
            hubspotContactId: contact.id,
            name: fullName,
            email: contact.email,
            company: realCompanyName,
            deals: filteredDeals,
            totalDealValue: filteredDeals.reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
            alreadyImported,
          });
        }
      }
    } catch (e: any) {
      console.error(`Search error for "${companyName}" query "${searchQuery}":`, e.message);
    }
  }

  return results;
}

function extractCourseFromDealName(dealName: string, contactName: string): { courseName: string; term: string } | null {
  let cleaned = dealName;
  const companyPrefixes = ['Indiana University', 'Purdue University', 'IU', 'Purdue'];
  for (const prefix of companyPrefixes) {
    if (cleaned.startsWith(prefix + ' - ')) {
      cleaned = cleaned.slice(prefix.length + 3).trim();
    } else if (cleaned.startsWith(prefix + ' ')) {
      cleaned = cleaned.slice(prefix.length + 1).trim();
    }
  }

  if (contactName) {
    const nameVariants = [contactName];
    const parts = contactName.split(' ');
    if (parts.length >= 2) {
      nameVariants.push(parts[parts.length - 1]);
    }
    for (const name of nameVariants) {
      const nameIdx = cleaned.indexOf(name);
      if (nameIdx !== -1) {
        cleaned = cleaned.slice(0, nameIdx) + cleaned.slice(nameIdx + name.length);
        cleaned = cleaned.replace(/^\s*-\s*/, '').replace(/\s*-\s*$/, '').trim();
      }
    }
  }

  cleaned = cleaned.replace(/\s*-?\s*Renewal\s+Deal\s*\d*/gi, '').trim();
  cleaned = cleaned.replace(/\s*-?\s*Deal\s*\d*/gi, '').trim();
  cleaned = cleaned.replace(/^\s*-\s*/, '').replace(/\s*-\s*$/, '').trim();

  const termPattern = /\b(Spring|Fall|Summer|Winter)\s+(\d{4})\b/i;
  const termMatch = cleaned.match(termPattern);
  let term = 'Current';
  if (termMatch) {
    term = `${termMatch[1]} ${termMatch[2]}`;
    cleaned = cleaned.replace(termPattern, '').trim();
    cleaned = cleaned.replace(/^\s*-\s*/, '').replace(/\s*-\s*$/, '').trim();
  }

  if (!cleaned || cleaned.length < 3) return null;

  return { courseName: cleaned, term };
}

export async function importSelectedContacts(
  contacts: HubSpotImportPreviewContact[],
  storage: {
    getInstructorByEmail: (email: string) => Promise<any>;
    createInstructor: (data: any) => Promise<any>;
    upsertDeal: (data: any) => Promise<any>;
    createCourse?: (data: any) => Promise<any>;
    getCoursesByInstructor?: (instructorId: number) => Promise<any[]>;
    addCourseInstructor?: (link: any) => Promise<any>;
    findOrCreateDepartment?: (instName: string, deptName: string) => Promise<any>;
  }
): Promise<{ instructorsCreated: number; dealsImported: number; coursesCreated: number; skipped: number }> {
  let instructorsCreated = 0;
  let dealsImported = 0;
  let coursesCreated = 0;
  let skipped = 0;

  for (const contact of contacts) {
    const existing = await storage.getInstructorByEmail(contact.email);
    let instructorId: number;

    if (existing) {
      instructorId = existing.id;
      if (contact.deals.length === 0) {
        skipped++;
        continue;
      }
    } else {
      let departmentId: number | null = null;
      if (storage.findOrCreateDepartment && contact.company) {
        const dept = await storage.findOrCreateDepartment(contact.company, "General");
        departmentId = dept.id;
      }
      const newInstructor = await storage.createInstructor({
        name: contact.name,
        email: contact.email,
        departmentId,
      });
      instructorId = newInstructor.id;
      instructorsCreated++;
    }

    const existingCourses = storage.getCoursesByInstructor
      ? await storage.getCoursesByInstructor(instructorId)
      : [];
    const existingCourseNames = new Set(existingCourses.map((c: any) => c.name?.toLowerCase()));

    for (const deal of contact.deals) {
      await storage.upsertDeal({
        hubspotDealId: deal.id,
        dealName: deal.dealName,
        stage: deal.stage,
        amount: deal.amount,
        closeDate: deal.closeDate,
        pipeline: deal.pipeline,
        instructorId,
        hubspotContactId: contact.hubspotContactId,
      });
      dealsImported++;

      if (storage.createCourse) {
        const courseInfo = extractCourseFromDealName(deal.dealName, contact.name);
        if (courseInfo && !existingCourseNames.has(courseInfo.courseName.toLowerCase())) {
          try {
            const course = await storage.createCourse({
              name: courseInfo.courseName,
              code: courseInfo.courseName.substring(0, 20),
              term: courseInfo.term,
              format: 'in-person',
              enrollment: 0,
            });
            if (storage.addCourseInstructor && course) {
              await storage.addCourseInstructor({
                courseId: course.id,
                instructorId,
                role: "primary",
              });
            }
            existingCourseNames.add(courseInfo.courseName.toLowerCase());
            coursesCreated++;
          } catch (e) {
            console.error(`Failed to create course from deal "${deal.dealName}":`, e);
          }
        }
      }
    }
  }

  return { instructorsCreated, dealsImported, coursesCreated, skipped };
}

export async function getDealStageLabel(client: Client, stageId: string): Promise<string> {
  try {
    const pipelines = await client.crm.pipelines.pipelinesApi.getAll('deals');
    for (const pipeline of pipelines.results) {
      for (const stage of pipeline.stages) {
        if (stage.id === stageId) return stage.label;
      }
    }
  } catch {}
  return stageId;
}

export async function fetchDealStageLabels(): Promise<Record<string, string>> {
  const client = await getUncachableHubSpotClient();
  const labels: Record<string, string> = {};
  try {
    const pipelines = await client.crm.pipelines.pipelinesApi.getAll('deals');
    for (const pipeline of pipelines.results) {
      for (const stage of pipeline.stages) {
        labels[stage.id] = stage.label;
      }
    }
  } catch (e) {
    console.error('Failed to fetch deal stage labels:', e);
  }
  return labels;
}
