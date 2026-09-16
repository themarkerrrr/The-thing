const fs = require('fs');

let code = fs.readFileSync('src/components/SandboxGame.tsx', 'utf8');

const dynamicScaleLogic = `
      // 6. Scale Name Tags and Chat Bubbles dynamically so they are always readable
      if (cameraRef.current) {
        const camPos = cameraRef.current.position;
        
        // Scale local player tags
        if (localStickmanRef.current) {
          const dist = Math.max(12, localStickmanRef.current.root.position.distanceTo(camPos));
          const factor = dist / 12; // Base distance where scale is 1
          localStickmanRef.current.nameTagSprite.scale.set(1.6 * factor, 0.4 * factor, 1);
          localStickmanRef.current.chatBubbleSprite.scale.set(2.2 * factor, 0.7 * factor, 1);
          
          // Slightly raise them so they don't overlap as much when scaled up
          localStickmanRef.current.nameTagSprite.position.set(0, 2.42 + (factor - 1) * 0.5, 0);
          localStickmanRef.current.chatBubbleSprite.position.set(0, 2.92 + (factor - 1) * 0.7, 0);
        }

        // Scale remote player tags
        for (const [, remote] of remotePlayersRef.current) {
          const dist = Math.max(12, remote.meshParts.root.position.distanceTo(camPos));
          const factor = dist / 12;
          remote.meshParts.nameTagSprite.scale.set(1.6 * factor, 0.4 * factor, 1);
          remote.meshParts.chatBubbleSprite.scale.set(2.2 * factor, 0.7 * factor, 1);
          
          remote.meshParts.nameTagSprite.position.set(0, 2.42 + (factor - 1) * 0.5, 0);
          remote.meshParts.chatBubbleSprite.position.set(0, 2.92 + (factor - 1) * 0.7, 0);
        }
      }

      // 7. Send Network Update
`;

code = code.replace(
  /\/\/ 6\. Send Network Update/,
  dynamicScaleLogic
);

// We need to also replace the network timer update from step 6 to 7
code = code.replace(
  /\/\/ 7\. Send Network Update/,
  '// 7. Send Network Update'
);

fs.writeFileSync('src/components/SandboxGame.tsx', code);
