require "datalog"
local dl = datalog

function test(name, f)
    local success, err = pcall(f)
    if success then
        print(name .. ": ok")
    else
        print(name .. ": fail: " .. err)
    end
end

test("Assert & Retract", function()
    -- assert & retract
    -- This one cleans up after itself so no need to worry
    local lit_foo = dl.make_literal("foo", {})
    local cls_foo = dl.make_clause(lit_foo, {})
    dl.assert(cls_foo)
    local answers = dl.ask(lit_foo)
    assert(answers ~= nil)
    assert(#answers == 1)
    assert(answers.name == "foo")
    dl.retract(cls_foo)

    local answers = dl.ask(lit_foo)
    assert(answers == nil)
end)

test("Simple Assertion", function()
    -- Test a simple related clause
    -- 1foo :- 1bar.
    -- 1bar.
    -- 1foo?
    local lit_foo = dl.make_literal("1foo", {})
    local lit_bar = dl.make_literal("1bar", {})
    dl.assert(dl.make_clause(lit_foo, {lit_bar}))
    local answers = dl.ask(lit_foo)
    assert(answers == nil)
    dl.assert(dl.make_clause(lit_bar, {}))
    local answers = dl.ask(lit_foo)
    assert(answers ~= nil)
    assert(#answers == 1)
    assert(answers.name == "1foo")
end)

test("Recursive ask", function()
    -- 3foo :- 3bar
    -- 3bar :- 3foo
    local lit_foo = dl.make_literal("3foo", {})
    local lit_bar = dl.make_literal("3bar", {})
    dl.assert(dl.make_clause(lit_foo, {lit_bar}))
    dl.assert(dl.make_clause(lit_bar, {lit_foo}))
    local answers = dl.ask(lit_foo)
    assert(answers == nil)
    dl.assert(dl.make_clause(lit_bar, {}))
    local answers = dl.ask(lit_foo)
    assert(#answers == 1)
    local answers = dl.ask(lit_bar)
    assert(#answers == 1)
end)

test("Simple w/ vars", function()
    -- 4foo(X) :- 4bar(X)
    local lit_foo = dl.make_literal("3foo", {dl.make_var("X")})
    local lit_bar = dl.make_literal("3bar", {dl.make_var("X")})
    dl.assert(dl.make_clause(lit_foo, {lit_bar}))
    dl.assert(dl.make_clause(lit_bar, {lit_foo}))
    local answers = dl.ask(lit_foo)
    assert(answers == nil)

    local lit_foo_const = dl.make_literal("3bar", {dl.make_const("test")})
    dl.assert(dl.make_clause(lit_foo_const, {}))

    local answers = dl.ask(lit_foo)
    assert(#answers == 1)
    assert(answers[1][1] == "test")
end)


test("Simple negated test", function()
    local lit_foo = dl.make_literal("2foo", {})
    local lit_not_bar = dl.make_literal("2bar", {}, true)
    local clause = dl.make_clause(lit_foo, {lit_not_bar})
    datalog.assert(clause)
    local answers = datalog.ask(lit_foo)
    assert(answers ~= nil)
    assert(#answers == 1)
    assert(answers.name == "2foo")
end)
