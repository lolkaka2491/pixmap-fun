import React from 'react';
import MarkdownFormatter from './MarkdownFormatter';

/** List of rules and their descriptions.
 * **NOTE: This will not affect any images or styling of specific rules!**
 * This list is for quick changes to wording in rules, not changing rules outright.
 * If you want to add or remove rules, make sure to change the HTML in the Rules() function!
 * The images are stored in `/pixelplanet/public/rule-images/`
 * @example
 * {
 *   name: 'The actual rule',
 *   desc: 'The description about the rule (optional)',
 *   imgs: ['Any images you want linked to the rule', 'imgs are optional', 'rule.jpg']
 * }
 */
const ruleList = {
  title: 'Game Rules',
  rules: [
    { // Rule 1
      name: `Proxy, VPN, bots, ip-reset, hacking, raiding, nuking, malwares, scams, doxxing (less than one month old), ip-grab, malicious files, DDoSing... is forbidden`,
      desc: `Violation of this rule will result in a permanent ban.\nExcept for "botting" bans, you can appeal this ban after 1 week has passed. You can appeal a "botting" ban after 1 month has passed.`
    },
    { // Rule 2
      name: `Nazism, fascism, communism, extremism, terrorism, homophobia, racism, religion hatred, NSFW are forbidden`,
      desc: `Violation of this rule will result in a ban for 3 days.\nYou can appeal this ban after 1 day.`
    },
    { // etc
      name: `Only 2 devices`,
      desc: `You may have only 1 alternative account. You may have only 1 alternative device.\nThe moderator will decide how to handle the violation of this rule.`
    },
    {
      name: `No new land on sea`,
      desc: `Do not build landmasses that were not already there.\nThe moderator will decide how to handle the violation of this rule.`,
      imgs: ['Rule_New-Land-Masses1.webp', 'Rule_New-Land-Masses2.webp']
    },
    {
      name: `No sinking`,
      desc: `Do not remove landmasses. Do not replace land with sea pixels.\nHowever, you can slightly modify the shape of the coastline.\nThe moderator will decide how to handle the violation of this rule.`,
      imgs: ['Rule_Sinking1.webp', 'Rule_Sinking2.webp']
    },
    {
      name: `No griefing`,
      desc: `Griefing is when ALL the following conditions are met:\n- Minimum of 500 pixels\n- Random color\n- Random placement\n- Unrelated to a faction\nThe moderator will decide how to handle the violation of this rule.`,
      imgs: ['Rule_Grief1.webp', 'Rule_Grief2.webp', 'Rule_Grief3.webp']
    },
    {
      name: `Blobs are tolerated up to 90 000 pixels (300 pixels by 300 pixels)`,
      desc: `After that, they must have a good pattern or good arts.\nRequests can be made for mods to vote.`
    },
    {
      name: `No grinding, except on the grinding canvas.`,
      desc: `Grinding is when you place pixels for the sole purpose of increasing your pixel count.\nGrinding is allowed on the "grinding canvas"`
    },
    {
      name: `Pattern copyrights:`,
      desc: `- Simple patterns copyrights for design (coming from the web) are only valid for the SAME pattern design AND a SINGLE color\n- Original patterns copyright are valid for that pattern design and ANY coloring`
    },
    {
      name: `Art copyrights:`,
      desc: `- Art designs can be copyrighted in [#pixelart-copyrights](https://discord.com/channels/1363523961740198148/1363902213151264880) in the [Discord](https://pixmap.fun/guilded).\n- Usage of copyrighted arts are prohibited outside of copyright holders decision.`
    },
    {
      name: `Pasting conditions`,
      desc: `- Must control 100% of the template surface\n- Must have painted 50% of the new template on the land\n- New template must be at least 50% different from the previous template AND present a good pattern`
    },
    {
      name: `Increasing quality of map with patterned factions`,
      desc: `- Factions with patterns are protected from attacks from BLOBS of at least 3000 pixels\n- Factions with arts but no pattern can still attack any other faction\n- Factions without pattern can still be attacked by blobs\n- In case of doubt, attacks can be reported and mods will address them.`
    }
  ]
};

/** Rule prop to format a single rule.
 * @see {@link Rules()} for a "list" of all rules.
 * @returns React Element with child elements
 */
function Rule({name, desc, imgs}) {
  
  if (imgs) {
    return (
      <div>
        <div className='rule-content-container'>
          <h2><MarkdownFormatter text={name}/></h2>
          {desc && <MarkdownFormatter text={desc} enableFirstParagraph={true}/>}
        </div>
        <div className='rule-image-container'>
          {imgs && imgs.map(relativeSource => (
            <a href={`./rule-images/${relativeSource}`} target='__blank'>
              <img src={`rule-images/${relativeSource}`}/>
            </a>
          ))}
        </div>
      </div>
    );
  } else {

    return (
    <div>
      <h2><MarkdownFormatter text={name}/></h2>
      {desc && <MarkdownFormatter text={desc} enableFirstParagraph={true}/>}
    </div>
    );
  }
}

/** The list of rules for the rules tab
 * Rules can be modified {@link ruleList|here}
 * @returns React Object/HTML
 */
function Rules() {
  return (
    <div className='rules-tab'>
      <h1>{ruleList.title}</h1>
      <p>Images too small? Click on the images to open them in a new tab!</p>
      <ol>
        {ruleList.rules.map(rule => (<>
          <hr/>
          <li>
            <Rule name={rule.name} desc={rule?.desc} imgs={rule?.imgs}/>
          </li>
        </>))}
      </ol>
    </div>
  );
}

export default React.memo(Rules);
