import {
  audienceOptions,
  audienceSummary,
  isAudienceValid,
  isRecipient,
  toggleAudience,
  type AudienceKey,
  type RecipientDevice,
} from './audience';

const visitor: RecipientDevice = {
  units: ['estaca'],
  signedIn: false,
  organizations: [],
  calls: [],
};

describe('audience options', () => {
  it('stake has 21 options in the documented order', () => {
    const options = audienceOptions('estaca');
    expect(options).toHaveLength(21);
    expect(options.slice(0, 4)).toEqual(['all', 'stake_presidency', 'high_council', 'bishoprics']);
    expect(options.slice(-7)).toEqual([
      'leaders',
      'relief_society',
      'elders_quorum',
      'young_women',
      'young_men',
      'primary',
      'temple_family_history',
    ]);
  });

  it('a unit has 19 options, without stake_presidency and high_council', () => {
    const options = audienceOptions('icara');
    expect(options).toHaveLength(19);
    expect(options).not.toContain('stake_presidency');
    expect(options).not.toContain('high_council');
    expect(options.slice(0, 2)).toEqual(['all', 'bishoprics']);
  });
});

describe('toggleAudience', () => {
  it('CA-07: tapping all on an empty selection selects every option', () => {
    const next = toggleAudience([], 'all', 'icara');
    expect(next).toEqual(audienceOptions('icara'));
    expect(audienceSummary(next, 'icara')).toEqual({ kind: 'everyone', unitKind: 'ward' });
  });

  it('tapping all again clears everything', () => {
    expect(toggleAudience(audienceOptions('icara'), 'all', 'icara')).toEqual([]);
  });

  it('unselecting one option drops all and keeps the rest', () => {
    const next = toggleAudience(audienceOptions('icara'), 'primary', 'icara');
    expect(next).not.toContain('all');
    expect(next).not.toContain('primary');
    expect(next).toHaveLength(17);
  });

  it('selecting every other option brings all in', () => {
    const others = audienceOptions('icara').filter((k) => k !== 'all' && k !== 'primary');
    const next = toggleAudience(others, 'primary', 'icara');
    expect(next).toContain('all');
    expect(next).toEqual(audienceOptions('icara'));
  });

  it('keeps the order of the options', () => {
    expect(toggleAudience(['primary'], 'bishoprics', 'icara')).toEqual(['bishoprics', 'primary']);
  });
});

describe('audienceSummary and validity', () => {
  it('CA-08: an empty selection is empty and invalid', () => {
    expect(audienceSummary([], 'icara')).toEqual({ kind: 'empty' });
    expect(isAudienceValid([], 'icara')).toBe(false);
  });

  it('groups follow the order of the options', () => {
    expect(audienceSummary(['primary', 'bishoprics'], 'estaca')).toEqual({
      kind: 'groups',
      keys: ['bishoprics', 'primary'],
    });
  });

  it('the summary of the stake and of a branch', () => {
    expect(audienceSummary(['all'], 'estaca')).toEqual({ kind: 'everyone', unitKind: 'stake' });
    expect(audienceSummary(['all'], 'ramoGaivota')).toEqual({
      kind: 'everyone',
      unitKind: 'branch',
    });
  });

  it('a key outside the options of the unit is invalid', () => {
    expect(isAudienceValid(['stake_presidency'], 'icara')).toBe(false);
    expect(isAudienceValid(['stake_presidency'], 'estaca')).toBe(true);
  });
});

describe('isRecipient (mirror of push_recipients)', () => {
  const member: RecipientDevice = {
    units: ['estaca'],
    signedIn: true,
    organizations: ['primary'],
    calls: [],
  };
  const bishop: RecipientDevice = {
    units: ['estaca'],
    signedIn: true,
    organizations: [],
    calls: [{ unitId: 'criciuma1', notifyGroup: 'bishoprics', access: 'unit_leader' }],
  };
  const ward1Only: RecipientDevice = { ...member, units: ['criciuma1'] };
  const audience: AudienceKey[] = ['primary', 'bishoprics'];

  it('CA-09: the member with primary and the bishop receive; the visitor and the other unit do not', () => {
    expect(isRecipient(member, 'estaca', audience)).toBe(true);
    expect(isRecipient(bishop, 'estaca', audience)).toBe(true);
    expect(isRecipient(visitor, 'estaca', audience)).toBe(false);
    expect(isRecipient(ward1Only, 'estaca', audience)).toBe(false);
  });

  it('CA-10: a visitor subscribed to icara receives all of icara', () => {
    expect(isRecipient({ ...visitor, units: ['icara'] }, 'icara', ['all'])).toBe(true);
    expect(isRecipient({ ...visitor, units: ['icara'] }, 'icara', ['primary'])).toBe(false);
  });

  it('leaders: only people with access in the unit of a unit item; any unit for a stake item', () => {
    const icaraLeader: RecipientDevice = {
      units: ['estaca', 'icara', 'criciuma1'],
      signedIn: true,
      organizations: [],
      calls: [{ unitId: 'icara', notifyGroup: null, access: 'unit_publisher' }],
    };
    const wardLeader: RecipientDevice = {
      ...icaraLeader,
      calls: [{ unitId: 'criciuma1', notifyGroup: null, access: 'unit_leader' }],
    };
    expect(isRecipient(icaraLeader, 'icara', ['leaders'])).toBe(true);
    expect(isRecipient(wardLeader, 'icara', ['leaders'])).toBe(false);
    expect(isRecipient(wardLeader, 'estaca', ['leaders'])).toBe(true);
  });

  it('a calling without access does not make a leader', () => {
    const teacher: RecipientDevice = {
      units: ['icara'],
      signedIn: true,
      organizations: [],
      calls: [{ unitId: 'icara', notifyGroup: null, access: 'none' }],
    };
    expect(isRecipient(teacher, 'icara', ['leaders'])).toBe(false);
  });

  it('a notify group in a unit item only counts in the same unit', () => {
    const device: RecipientDevice = { ...bishop, units: ['estaca', 'icara', 'criciuma1'] };
    expect(isRecipient(device, 'icara', ['bishoprics'])).toBe(false);
    expect(isRecipient(device, 'criciuma1', ['bishoprics'])).toBe(true);
  });
});
