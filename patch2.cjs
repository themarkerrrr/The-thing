const fs = require('fs');
let code = fs.readFileSync('src/components/TitleScreen.tsx', 'utf8');

// Change Arial back to Comic Neue
code = code.replace(/font-arial/g, 'font-comic');
code = code.replace(/Arial, sans-serif/g, 'Comic Neue, cursive');

fs.writeFileSync('src/components/TitleScreen.tsx', code);
