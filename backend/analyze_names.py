import json, glob, re

for pid, sk in [('dehuan_liu','awards'), ('yaruo_qu','membership'), ('dehuan_liu','leading_role')]:
    files = sorted(glob.glob(f'backend/data/projects/{pid}/writing_v3/writing_{sk}_*.json'))
    with open(files[-1], encoding='utf-8') as f:
        data = json.load(f)
    para = data['paragraph_text']

    # Titled names
    titled = re.findall(r'(?:Dr|Prof|Professor|Mr|Ms|Mrs|Director|Chairman|Dean|Vice Dean|Vice President)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?', para)

    # Single-quoted verbatim text
    quotes_single = re.findall(r"'[^']{15,}'", para)
    # Double-quoted verbatim text
    quotes_double = re.findall(r'"[^"]{15,}"', para)
    all_quotes = quotes_single + quotes_double

    # Capitalized name pairs
    cap_pairs = re.findall(r'[A-Z][a-z]+\s+[A-Z][a-z]+', para)
    noise = {'Peking University','Social Sciences','New Media','Journalism Communication','World University',
             'Exhibit A','Exhibit B','Exhibit C','Exhibit D','Exhibit E','Exhibit F',
             'The Beneficiary','United States','The Association','QS World','Ministry Education',
             'Data Awards','Data Legacy','Big Data','Higher Education','Award Committee',
             'Information Communications','Scientific Research','Hundred People','Outstanding Achievements',
             'Shanghai Fitness','Bodybuilding Association','National Institute','China National',
             'School Journalism','School New','Vice Dean','Vice President',
             'Academic Committee','Academic Degree','Indiana University','Annual Report'}
    cap_pairs_filtered = [n for n in cap_pairs if n not in noise and 'Exhibit' not in n]

    print(f'{pid}/{sk}:')
    print(f'  Titled names ({len(titled)}): {titled}')
    print(f'  Other capitalized pairs: {cap_pairs_filtered[:15]}')
    print(f'  Quoted passages ({len(all_quotes)}):')
    for q in all_quotes[:5]:
        snip = q[:120] + '...' if len(q) > 120 else q
        print(f'    {snip}')
    print()
