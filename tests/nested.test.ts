import { decode, deserialize, key, union, encode } from "../src";

//#region Abstract Union with numerical keys

abstract class Parent {
  @key(0)
  num?: number;
  @key(1)
  str?: string;
}

@union(0, Parent)
class Child1 extends Parent {
  @key(2)
  childNum?: number;
}

@union(1, Parent)
class Child2 extends Parent {
  @key(2)
  childVal?: boolean;
}

class ParentMap {
  @key(0, Parent)
  items: Record<string, Parent>;
}

class ParentArray {
  @key(0, Parent)
  items: Parent[];
}

it("deserializes inherited maps", () => {
  const itm0 = new Child1();
  itm0.num = 1;
  itm0.str = "one";
  itm0.childNum = 2;

  const itm1 = new Child2();
  itm1.num = 11;
  itm1.str = "eleven";
  itm1.childVal = true;

  const parent = new ParentMap();
  parent.items = {};
  parent.items["itm0-instance"] = itm0;
  parent.items["itm1-instance"] = itm1;

  var decoded = decode(encode(parent, ParentMap), ParentMap);

  Object.keys(decoded.items).forEach((k) => {
    expect(decoded.items[k] instanceof Parent).toEqual(true);
    expect(decoded.items[k]).toEqual(parent.items[k]);
  });
});

it("deserializes inherited arrays", () => {
  const itm0 = new Child1();
  itm0.num = 1;
  itm0.str = "one";
  itm0.childNum = 2;

  const itm1 = new Child2();
  itm1.num = 11;
  itm1.str = "eleven";
  itm1.childVal = true;

  const parent = new ParentArray();
  parent.items = [itm0, itm1];

  var decoded = decode(encode(parent, ParentArray), ParentArray);

  decoded.items.forEach((itm, ind) => {
    expect(itm instanceof Parent).toEqual(true);
    expect(itm).toEqual(parent.items[ind]);
  });
});

it("gracefully ignores additional properties", () => {
  const itm0 = new Child1();
  itm0.num = 1;
  itm0.str = "one";
  itm0.childNum = 2;
  const data = [0, [1, "one", 2, "new-data"]];

  const decoded = deserialize(data, Parent);
  expect(itm0.num).toEqual(decoded.num);
  expect(itm0.str).toEqual(decoded.str);
  expect(itm0.childNum).toEqual((<Child1>decoded).childNum);
});

it("gracefully ignores additional union types", () => {
  const itm0 = new Child1();
  itm0.num = 1;
  itm0.str = "one";
  itm0.childNum = 2;
  const data = [2, [1, "one", "new-data"]];

  const decoded = deserialize(data, Parent);
  expect(decoded).toEqual(undefined);
});
