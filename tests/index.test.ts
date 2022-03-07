import { decode, key, union, encode } from "../src";

//#region Abstract Union with numerical keys

abstract class AbstractUnionNumParent {
  @key(0)
  num?: number;
  @key(1)
  str?: string;
  @key(2)
  bool?: boolean;
  @key(3, Number)
  numArr?: number[];
  @key(4, String)
  strArr?: string[];
  @key(5)
  missing?: string;
  @key(6)
  numRecord?: Record<string, number>;
  @key(7)
  strRecord?: Record<string, string>;
  @key(8)
  abstractChild?: AbstractUnionNumParent;
  @key(13, AbstractUnionNumParent)
  abstractChildArr?: AbstractUnionNumParent[];
  @key(14, AbstractUnionNumParent)
  abstractChildMap?: Record<string, AbstractUnionNumParent>;
}

@union(0, AbstractUnionNumParent)
class UnionNumChild0 extends AbstractUnionNumParent {
  @key(9)
  childNum?: number;
}

@union(1, AbstractUnionNumParent)
class UnionNumChild1 extends AbstractUnionNumParent {
  @key(9)
  childStr?: string;
  @key(10)
  concreteChild?: UnionNumChild0;
  @key(11, UnionNumChild0)
  concreteChildArr?: UnionNumChild0[];
  @key(12, UnionNumChild0)
  concreteChildMap?: Record<string, UnionNumChild0>;
}

//#endregion

//#region Abstract union with string keys

abstract class AbstractUnionStrParent {
  @key("zero")
  num?: number;
  @key("one")
  str?: string;
  @key("two")
  bool?: boolean;
  @key("three", Number)
  numArr?: number[];
  @key("four", String)
  strArr?: string[];
  @key("five")
  missing?: string;
  @key("six")
  numRecord?: Record<string, number>;
  @key("seven")
  strRecord?: Record<string, string>;
  @key("eight")
  abstractChild?: AbstractUnionStrParent;
  @key("twelve", AbstractUnionStrParent)
  abstractChildArr?: AbstractUnionStrParent[];
  @key("fifteen", AbstractUnionStrParent)
  abstractChildMap?: Record<string, AbstractUnionStrParent>;
}

@union("union0", AbstractUnionStrParent)
class UnionStrChild0 extends AbstractUnionStrParent {
  @key("nine")
  childNum?: number;
}

@union("union1", AbstractUnionStrParent)
class UnionStrChild1 extends AbstractUnionStrParent {
  @key("nine")
  childStr?: string;
  @key("eleven")
  concreteChild?: UnionStrChild0;
  @key("thirteen", UnionStrChild0)
  concreteChildArr?: UnionStrChild0[];
  @key("sixteen", UnionStrChild0)
  concreteChildMap?: Record<string, UnionStrChild0>;
}
//#endregion

//#region Tests

it("Serializes child (string keys)", () => {
  const uc1 = instantiate(UnionStrChild0, UnionStrChild1);
  const serialized = encode(uc1);
  const deserialized = decode(serialized, UnionStrChild1);
  expect(deserialized).toEqual(uc1);
});

it("Serializes child (indexed keys)", () => {
  const uc1 = instantiate(UnionNumChild0, UnionNumChild1);
  const serialized = encode(uc1);
  const deserialized = decode(serialized, UnionNumChild1);
  expect(deserialized).toEqual(uc1);
});

it("Serializes child as interface (string keys)", () => {
  const uc1 = instantiate(UnionStrChild0, UnionStrChild1);
  const serialized = encode(uc1, AbstractUnionStrParent);
  const deserialized = decode(serialized, AbstractUnionStrParent);
  //console.info("uc1", serialize(uc1, AbstractUnionStrParent));
  expect(deserialized).toEqual(uc1);
});

it("Serializes child as interface (indexed keys)", () => {
  const uc1 = instantiate(UnionNumChild0, UnionNumChild1);
  const serialized = encode(uc1, AbstractUnionNumParent);
  const deserialized = decode(serialized, AbstractUnionNumParent);
  expect(deserialized).toEqual(uc1);
});

//#endregion

function instantiate<
  T0 extends new () => UnionNumChild0 | UnionStrChild0,
  T1 extends new () => UnionNumChild1 | UnionStrChild1
>(ctor0: T0, ctor1: T1) {
  const uc1 = new ctor1();
  uc1.num = 0.25;
  uc1.str = "hello";
  uc1.bool = false;
  uc1.numArr = [1, 2, 3];
  uc1.strArr = ["arrOne", "arrTwo", "arrThree"];
  uc1.missing = undefined;
  uc1.numRecord = {
    one: 1,
    two: 2,
  };
  uc1.strRecord = {
    one: "two",
    three: "four",
  };

  uc1.childStr = "childStrVal";
  const concreteChild = new ctor0();
  concreteChild.num = 5;
  concreteChild.childNum = 5;
  concreteChild.str = "concreteChildStr";

  uc1.concreteChild = concreteChild;

  const abstractChild = new ctor0();
  abstractChild.num = 4;
  abstractChild.childNum = 6;
  uc1.abstractChild = abstractChild;

  uc1.concreteChildArr = [abstractChild, null, abstractChild];
  uc1.abstractChildArr = [abstractChild, abstractChild, null];
  uc1.abstractChildMap = {
    one: abstractChild,
    two: null,
    three: abstractChild,
  };

  uc1.concreteChildMap = {
    one: abstractChild,
    two: null,
    three: abstractChild,
  };

  return uc1;
}
