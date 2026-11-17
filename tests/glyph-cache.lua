-- Run after WebRuntime.glyphCacheLua, in the same Lua chunk.
local created=0
love={graphics={newText=function(font,char)
 created=created+1
 return {font=font,char=char}
end}}
local font1,font2={},{}
local first=web_cached_glyph(font1,'a')
assert(web_cached_glyph(font1,'a')==first, 'Repeated glyph must reuse the drawable')
assert(web_cached_glyph(font2,'a')~=first, 'Fonts must remain independent')
for i=1,1000 do web_cached_glyph(font1,'a') end
assert(created==2, 'Repeated characters must not allocate new text')
for i=1,300 do web_cached_glyph(font1,'glyph'..i) end
local count=0
for _ in pairs(web_glyph_fonts[font1].values) do count=count+1 end
assert(count==256, 'Cache must stay bounded')
assert(first.char=='a' and first.font==font1, 'Eviction must preserve live drawables')
assert(web_cached_glyph(font1,'a')~=first, 'Evicted glyph must be recreated')
return 'PASS glyph cache: reuse, font separation, 256-entry limit, live drawable preservation'
