import { validateInput, suggestBuildingsFromInput } from '../inputValidate';

// If running this file standalone (node), there may not be a global
// `_campusSuggestions` variable. Declare it so TypeScript doesn't error,
// then provide a small fallback dataset so the script can run for testing.
const _campusSuggestions: Array<{ display_name: string; lat: string; lon: string; }> = [
  { display_name: 'Administration Building', lat: '39.253139642304824', lon: '-76.71346680103554' },
  { display_name: 'Albin O. Kuhn Library & Gallery', lat: '39.25660870000', lon: '-76.71245780000' },
  { display_name: 'Engineering and Information Technology Building (EIT)', lat: '39.25457800522658', lon: '-76.7140007717771' },
  { display_name: 'Retriever Activities Center (RAC)', lat: '39.25519773199664', lon: '-76.71493830501481' },
  { display_name: 'University Center (UC)', lat: '39.254311897833894', lon: '-76.71321113149463' },
  { display_name: 'Fine Arts Building', lat: '39.25507302014908', lon: '-76.7134835986718' },
  { display_name: 'Performing Arts and Humanities Building (PAHB)', lat: '39.25519773199664', lon: '-76.71493830501481' },
  { display_name: 'Math & Psychology Building', lat: '39.25414744528721', lon: '-76.71235531860366' },
  { display_name: 'Biological Sciences Building', lat: '39.25478924768158', lon: '-76.71211805398877' },
  { display_name: 'Chemistry Building', lat: '39.25501939795551', lon: '-76.71303157922023' },
  { display_name: 'Physics Building', lat: '39.254509055300275', lon: '-76.70955550430352' },
  { display_name: 'Information Technology/Engineering (ITE)', lat: '39.25384780762936', lon: '-76.71410470533095' },
  { display_name: 'Public Policy Building', lat: '39.25532623674318', lon: '-76.70925261800328' },
  { display_name: 'Sondheim Hall', lat: '39.25341011749078', lon: '-76.71285953326642' },
  { display_name: 'Sherman Hall', lat: '39.253570103778465', lon: '-76.71356789706488' },
  { display_name: 'The Commons', lat: '39.255054104325616', lon: '-76.71070371980493' },
  { display_name: 'Patapsco Hall', lat: '39.255081965955036', lon: '-76.70673668410498' },
  { display_name: 'Potomac Hall', lat: '39.25606238825957', lon: '-76.70651576586262' },
  { display_name: 'Chesapeake Hall', lat: '39.256849988344115', lon: '-76.70873138610621' },
  { display_name: 'Susquehanna Hall', lat: '39.255639813873316', lon: '-76.70848158822243' },
  { display_name: 'Erickson Hall', lat: '39.25727595128962', lon: '-76.70971290743068' },
  { display_name: 'Harbor Hall', lat: '39.2574527259495', lon: '-76.70849733643549' },
  { display_name: 'Walker Avenue Apartments', lat: '39.25954838908427', lon: '-76.71396897666577' },
  { display_name: 'West Hill Apartments', lat: '39.258901446872265', lon: '-76.71259174840102' },
  { display_name: 'Hillside Apartments', lat: '39.2583895527449', lon: '-76.7090028757811' },
  { display_name: 'True Grits Dining Hall', lat: '39.255776326112745', lon: '-76.70773529041553' },
  { display_name: 'UMBC Event Center', lat: '39.25236663879639', lon: '-76.70744131697373' },
  { display_name: 'Chesapeake Employers Insurance Arena', lat: '39.25236663879639', lon: '-76.70744131697373' },
  { display_name: 'Administration Parking Garage', lat: '39.25302693252615', lon: '-76.71420411442547' },
  { display_name: 'Commons Garage', lat: '39.253422965942974', lon: '-76.7094846596835' },
  { display_name: 'Walker Avenue Garage', lat: '39.25727870467512', lon: '-76.71231647640951' },
  { display_name: 'PAHB Parking Lot', lat: '39.255380076952584', lon: '-76.71460837990287' },
  { display_name: 'UMBC Bookstore', lat: '39.254591718818936', lon: '-76.7108989975142' },
  { display_name: 'UMBC Stadium', lat: '39.250562339226114', lon: '-76.70737195403173' },
  { display_name: 'UMBC Technology Center', lat: '39.25519728191527', lon: '-76.70236441392518' },
  { display_name: 'bwtech@UMBC North', lat: '39.24946312236066', lon: '-76.7144157716465' },
  { display_name: 'bwtech@UMBC South', lat: '39.24813201069917', lon: '-76.71439688284313' }
];

const userInput = "Finn Art ";
const words = validateInput(userInput);

const suggestions = suggestBuildingsFromInput(words, _campusSuggestions);
console.log('Input Words:', words);
console.log('Suggestions:', suggestions);