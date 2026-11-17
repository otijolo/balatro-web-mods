const fs=require('fs'),vm=require('vm'),assert=require('assert');
const c={};vm.runInNewContext(fs.readFileSync(require.resolve('../runtime-compat.js'),'utf8'),c);
const source=`local copy = copy_card(SUITS[suit_map[j]][i],nil, _scale)
copy.greyed = greyed
copy.T.x = view_deck.T.x + view_deck.T.w/2
copy.T.y = view_deck.T.y
copy:hard_set_T()
view_deck:emplace(copy)`;
const out=c.WebRuntime.deferDeckPreviews(source);
assert.equal(out,'web_queue_deck_preview(SUITS[suit_map[j]][i], view_deck, greyed, _scale)');
assert.equal(c.WebRuntime.deferDeckPreviews(out),out);
for(const untouched of ['local copy = copy_card(card,nil,1)',source.replace('copy.greyed = greyed','copy.greyed = false')])assert.equal(c.WebRuntime.deferDeckPreviews(untouched),untouched);
console.log('PASS preview transform: exact visual block, idempotence, gameplay copies preserved');
