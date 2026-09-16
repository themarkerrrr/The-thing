const fs = require('fs');
let code = fs.readFileSync('src/components/SandboxGame.tsx', 'utf8');

const blurRegex = /window\.addEventListener\('keyup', handleKeyUp\);/m;
const newBlur = `window.addEventListener('keyup', handleKeyUp);
    const handleBlur = () => {
      keysRef.current = {};
    };
    window.addEventListener('blur', handleBlur);`;
code = code.replace(blurRegex, newBlur);

const removeBlurRegex = /window\.removeEventListener\('keyup', handleKeyUp\);/m;
const removeNewBlur = `window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);`;
code = code.replace(removeBlurRegex, removeNewBlur);

fs.writeFileSync('src/components/SandboxGame.tsx', code);
