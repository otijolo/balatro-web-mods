-- Append after WebRuntime.deckPreviewLua in an isolated Lua state.
local clock,delay,calls=0,0.001,0
love={timer={getTime=function() return clock end}}
copy_card=function(source,unused,scale)
 calls=calls+1;clock=clock+delay
 return {source=source,scale=scale,T={},hard_set_T=function(self) self.positioned=true end}
end
local function area()
 return {T={x=10,y=20,w=8},cards={},emplace=function(self,card) self.cards[#self.cards+1]=card end}
end
local a=area();local cards={}
for i=1,52 do cards[i]={id=i};web_queue_deck_preview(cards[i],a,i%2==0,0.7) end
for frame=1,26 do
 local before=calls;web_fill_deck_previews();assert(calls-before==2,'Two-card budget')
end
assert(#a.cards==52)
for i,c in ipairs(a.cards) do
 assert(c.source==cards[i] and c.scale==0.7 and c.greyed==(i%2==0))
 assert(c.T.x==14 and c.T.y==20 and c.positioned)
end
local b=area();delay=0.005
for i=1,5 do web_queue_deck_preview(cards[i],b,false,0.7) end
local before=calls;web_fill_deck_previews();assert(calls-before==1,'Time budget')
b.REMOVED=true;before=calls;web_fill_deck_previews();assert(calls==before,'Closed preview must cancel')
local c=area();web_queue_deck_preview(cards[1],c,false,0.7);web_fill_deck_previews()
assert(#c.cards==1,'Queue must work after cancellation')
cards[2].REMOVED=true;web_queue_deck_preview(cards[2],c,false,0.7);web_fill_deck_previews();assert(#c.cards==1)
return 'PASS preview queue: 52 ordered copies, two-card/time budgets, positions, greyed state, cancellation and restart'
