#include "TypedObjectConstants.h"

///////////////////////////////////////////////////////////////////////////
// Getters and setters for various slots.

// Type repr slots

#define REPR_KIND(obj)   \
    TO_INT32(UnsafeGetReservedSlot(obj, JS_TYPEREPR_SLOT_KIND))
#define REPR_SIZE(obj)   \
    TO_INT32(UnsafeGetReservedSlot(obj, JS_TYPEREPR_SLOT_SIZE))
#define REPR_LENGTH(obj)   \
    TO_INT32(UnsafeGetReservedSlot(obj, JS_TYPEREPR_SLOT_LENGTH))
#define REPR_TYPE(obj)   \
    TO_INT32(UnsafeGetReservedSlot(obj, JS_TYPEREPR_SLOT_TYPE))

// Type object slots

#define DESCR_TYPE_REPR(obj) \
    UnsafeGetReservedSlot(obj, JS_DESCR_SLOT_TYPE_REPR)
#define DESCR_KIND(obj) \
    REPR_KIND(DESCR_TYPE_REPR(obj))
#define DESCR_SIZE(obj) \
    UnsafeGetReservedSlot(obj, JS_DESCR_SLOT_SIZE)
#define DESCR_SIZED_ARRAY_LENGTH(obj) \
    TO_INT32(UnsafeGetReservedSlot(obj, JS_DESCR_SLOT_SIZED_ARRAY_LENGTH))
#define DESCR_TYPE(obj)   \
    UnsafeGetReservedSlot(obj, JS_DESCR_SLOT_TYPE)
#define DESCR_STRUCT_FIELD_NAMES(obj) \
    UnsafeGetReservedSlot(obj, JS_DESCR_SLOT_STRUCT_FIELD_NAMES)
#define DESCR_STRUCT_FIELD_TYPES(obj) \
    UnsafeGetReservedSlot(obj, JS_DESCR_SLOT_STRUCT_FIELD_TYPES)
#define DESCR_STRUCT_FIELD_OFFSETS(obj) \
    UnsafeGetReservedSlot(obj, JS_DESCR_SLOT_STRUCT_FIELD_OFFSETS)

// Typed object slots

#define DATUM_TYPE_DESCR(obj) \
    UnsafeGetReservedSlot(obj, JS_DATUM_SLOT_TYPE_DESCR)
#define DATUM_OWNER(obj) \
    UnsafeGetReservedSlot(obj, JS_DATUM_SLOT_OWNER)
#define DATUM_LENGTH(obj) \
    TO_INT32(UnsafeGetReservedSlot(obj, JS_DATUM_SLOT_LENGTH))

#define HAS_PROPERTY(obj, prop) \
    callFunction(std_Object_hasOwnProperty, obj, prop)

function DATUM_TYPE_REPR(obj) {
  // Eventually this will be a slot on typed objects
  return DESCR_TYPE_REPR(DATUM_TYPE_DESCR(obj));
}

///////////////////////////////////////////////////////////////////////////
// DescrToSource
//
// Converts a type descriptor to a descriptive string

// toSource() for type descriptors.
//
// Warning: user exposed!
function DescrToSourceMethod() {
  if (!IsObject(this) || !ObjectIsTypeDescr(this))
    ThrowError(JSMSG_INCOMPATIBLE_PROTO, "Type", "toSource", "value");

  return DescrToSource(this);
}

function DescrToSource(descr) {
  assert(IsObject(descr) && ObjectIsTypeDescr(descr),
         "DescrToSource: not type descr");

  switch (DESCR_KIND(descr)) {
  case JS_TYPEREPR_SCALAR_KIND:
    switch (DESCR_TYPE(descr)) {
    case JS_SCALARTYPEREPR_INT8: return "int8";
    case JS_SCALARTYPEREPR_UINT8: return "uint8";
    case JS_SCALARTYPEREPR_UINT8_CLAMPED: return "uint8Clamped";
    case JS_SCALARTYPEREPR_INT16: return "int16";
    case JS_SCALARTYPEREPR_UINT16: return "uint16";
    case JS_SCALARTYPEREPR_INT32: return "int32";
    case JS_SCALARTYPEREPR_UINT32: return "uint32";
    case JS_SCALARTYPEREPR_FLOAT32: return "float32";
    case JS_SCALARTYPEREPR_FLOAT64: return "float64";
    }
    assert(false, "Unhandled type: " + DESCR_TYPE(descr));
    return undefined;

  case JS_TYPEREPR_REFERENCE_KIND:
    switch (DESCR_TYPE(descr)) {
    case JS_REFERENCETYPEREPR_ANY: return "any";
    case JS_REFERENCETYPEREPR_OBJECT: return "Object";
    case JS_REFERENCETYPEREPR_STRING: return "string";
    }
    assert(false, "Unhandled type: " + DESCR_TYPE(descr));
    return undefined;

  case JS_TYPEREPR_X4_KIND:
    switch (DESCR_TYPE(descr)) {
    case JS_X4TYPEREPR_FLOAT32: return "float32x4";
    case JS_X4TYPEREPR_INT32: return "int32x4";
    }
    assert(false, "Unhandled type: " + DESCR_TYPE(descr));
    return undefined;

  case JS_TYPEREPR_STRUCT_KIND:
    var result = "new StructType({";
    var fieldNames = DESCR_STRUCT_FIELD_NAMES(descr);
    var fieldTypes = DESCR_STRUCT_FIELD_TYPES(descr);
    for (var i = 0; i < fieldNames.length; i++) {
      if (i != 0)
        result += ", ";

      result += fieldNames[i];
      result += ": ";
      result += DescrToSource(fieldTypes[i]);
    }
    result += "})";
    return result;

  case JS_TYPEREPR_UNSIZED_ARRAY_KIND:
    return "new ArrayType(" + DescrToSource(descr.elementType) + ")";

  case JS_TYPEREPR_SIZED_ARRAY_KIND:
    var result = ".array";
    var sep = "(";
    while (DESCR_KIND(descr) == JS_TYPEREPR_SIZED_ARRAY_KIND) {
      result += sep + DESCR_SIZED_ARRAY_LENGTH(descr);
      descr = descr.elementType;
      sep = ", ";
    }
    return DescrToSource(descr) + result + ")";
  }

  assert(false, "Unhandled kind: " + DESCR_KIND(descr));
  return undefined;
}

///////////////////////////////////////////////////////////////////////////
// TypedObjectPointer
//
// TypedObjectPointers are internal structs used to represent a
// pointer into typed object memory. They pull together:
// - descr: the type descriptor
// - datum: the typed object that contains the allocated block of memory
// - offset: an offset into that typed object
//
// They are basically equivalent to a typed object, except that they
// offer lots of internal unsafe methods and are not native objects.
// These should never escape into user code; ideally ion would stack
// allocate them.
//
// Most `TypedObjectPointers` methods are written in a "chaining"
// style, meaning that they return `this`. This is true even though
// they mutate the receiver in place, because it makes for prettier
// code.

function TypedObjectPointer(descr, datum, offset) {
  assert(IsObject(descr) && ObjectIsTypeDescr(descr), "Not descr");
  assert(IsObject(datum) && ObjectIsTypedDatum(datum), "Not datum");
  assert(TO_INT32(offset) === offset, "offset not int");

  this.descr = descr;
  this.datum = datum;
  this.offset = offset;
}

MakeConstructible(TypedObjectPointer, {});

TypedObjectPointer.fromTypedDatum = function(typed) {
  return new TypedObjectPointer(DATUM_TYPE_DESCR(typed), typed, 0);
}

#ifdef DEBUG
TypedObjectPointer.prototype.toString = function() {
  return "Ptr(" + DescrToSource(this.descr) + " @ " + this.offset + ")";
};
#endif

TypedObjectPointer.prototype.copy = function() {
  return new TypedObjectPointer(this.descr, this.datum, this.offset);
};

TypedObjectPointer.prototype.reset = function(inPtr) {
  this.descr = inPtr.descr;
  this.datum = inPtr.datum;
  this.offset = inPtr.offset;
  return this;
};

TypedObjectPointer.prototype.kind = function() {
  return DESCR_KIND(this.descr);
}

// Extract the length. This does a switch on kind, so it's
// best if we can avoid it.
TypedObjectPointer.prototype.length = function() {
  switch (this.kind()) {
  case JS_TYPEREPR_SIZED_ARRAY_KIND:
    return DESCR_SIZED_ARRAY_LENGTH(this.descr);

  case JS_TYPEREPR_UNSIZED_ARRAY_KIND:
    return this.datum.length;
  }
  assert(false, "Invalid kind for length");
  return false;
}

///////////////////////////////////////////////////////////////////////////
// Moving the pointer
//
// The methods in this section adjust `this` in place to point at
// subelements or subproperties.

// Adjusts `this` in place so that it points at the property
// `propName`.  Throws if there is no such property. Returns `this`.
TypedObjectPointer.prototype.moveTo = function(propName) {
  switch (this.kind()) {
  case JS_TYPEREPR_SCALAR_KIND:
  case JS_TYPEREPR_REFERENCE_KIND:
  case JS_TYPEREPR_X4_KIND:
    break;

  case JS_TYPEREPR_SIZED_ARRAY_KIND:
    return this.moveToArray(propName, DESCR_SIZED_ARRAY_LENGTH(this.descr));

  case JS_TYPEREPR_UNSIZED_ARRAY_KIND:
    return this.moveToArray(propName, this.datum.length);

  case JS_TYPEREPR_STRUCT_KIND:
    if (HAS_PROPERTY(this.descr.fieldTypes, propName))
      return this.moveToField(propName);
    break;
  }

  ThrowError(JSMSG_TYPEDOBJECT_NO_SUCH_PROP, propName);
  return undefined;
};

TypedObjectPointer.prototype.moveToArray = function(propName, length) {
  // For an array, property must be an element. Note that we take
  // the length as an argument rather than loading it from the descriptor.
  // This is because this same helper is used for *unsized arrays*, where
  // the length is drawn from the datum, and *sized arrays*, where the
  // length is drawn from the type.
  var index = TO_INT32(propName);
  if (index === propName && index >= 0 && index < length)
    return this.moveToElem(index);

  ThrowError(JSMSG_TYPEDOBJECT_NO_SUCH_PROP, propName);
  return undefined;
}

// Adjust `this` in place to point at the element `index`.  `this`
// must be a array type and `index` must be within bounds. Returns
// `this`.
TypedObjectPointer.prototype.moveToElem = function(index) {
  assert(this.kind() == JS_TYPEREPR_SIZED_ARRAY_KIND ||
         this.kind() == JS_TYPEREPR_UNSIZED_ARRAY_KIND,
         "moveToElem invoked on non-array");
  assert(TO_INT32(index) === index,
         "moveToElem invoked with non-integer index");
  assert(index >= 0 && index < this.length(),
         "moveToElem invoked with negative index: " + index);

  var elementDescr = this.descr.elementType;
  this.descr = elementDescr;
  var elementSize = DESCR_SIZE(elementDescr);

  // Note: we do not allow construction of arrays where the offset
  // of an element cannot be represented by an int32.
  this.offset += std_Math_imul(index, elementSize);

  return this;
};

TypedObjectPointer.prototype.moveToField = function(propName) {
  var fieldNames = DESCR_STRUCT_FIELD_NAMES(this.descr);
  var index = fieldNames.indexOf(propName);
  if (index != -1)
    return this.moveToFieldIndex(index);

  ThrowError(JSMSG_TYPEDOBJECT_NO_SUCH_PROP, propName);
  return undefined;
}

// Adjust `this` to point at the field `propName`.  `this` must be a
// struct type and `propName` must be a valid field name. Returns
// `this`.
TypedObjectPointer.prototype.moveToFieldIndex = function(index) {
  assert(this.kind() == JS_TYPEREPR_STRUCT_KIND,
         "moveToFieldIndex invoked on non-struct");
  assert(index >= 0 && index < DESCR_STRUCT_FIELD_NAMES(this.descr).length,
         "moveToFieldIndex invoked with invalid field index " + index);

  var fieldDescr = DESCR_STRUCT_FIELD_TYPES(this.descr)[index];
  var fieldOffset = TO_INT32(DESCR_STRUCT_FIELD_OFFSETS(this.descr)[index]);

  assert(IsObject(fieldDescr) && ObjectIsTypeDescr(fieldDescr),
         "bad field descr");
  assert(TO_INT32(fieldOffset) === fieldOffset,
         "bad field offset");
  assert(fieldOffset >= 0 && fieldOffset < DESCR_SIZE(this.descr),
         "out of bounds field offset");

  this.descr = fieldDescr;
  this.offset += fieldOffset;

  return this;
}

///////////////////////////////////////////////////////////////////////////
// Getting values
//
// The methods in this section read from the memory pointed at
// by `this` and produce JS values. This process is called *reification*
// in the spec.

// Reifies the value referenced by the pointer, meaning that it
// returns a new object pointing at the value. If the value is
// a scalar, it will return a JS number, but otherwise the reified
// result will be a typed object or handle, depending on the type
// of the ptr's datum.
TypedObjectPointer.prototype.get = function() {
  assert(ObjectIsAttached(this.datum), "get() called with unattached datum");

  switch (this.kind()) {
  case JS_TYPEREPR_SCALAR_KIND:
    return this.getScalar();

  case JS_TYPEREPR_REFERENCE_KIND:
    return this.getReference();

  case JS_TYPEREPR_X4_KIND:
    return this.getX4();

  case JS_TYPEREPR_SIZED_ARRAY_KIND:
    return NewDerivedTypedDatum(this.descr, this.datum, this.offset);

  case JS_TYPEREPR_STRUCT_KIND:
    return NewDerivedTypedDatum(this.descr, this.datum, this.offset);

  case JS_TYPEREPR_UNSIZED_ARRAY_KIND:
    assert(false, "Unhandled repr kind: " + this.kind());
  }

  assert(false, "Unhandled kind: " + this.kind());
  return undefined;
}

TypedObjectPointer.prototype.getScalar = function() {
  var type = DESCR_TYPE(this.descr);
  switch (type) {
  case JS_SCALARTYPEREPR_INT8:
    return Load_int8(this.datum, this.offset);

  case JS_SCALARTYPEREPR_UINT8:
  case JS_SCALARTYPEREPR_UINT8_CLAMPED:
    return Load_uint8(this.datum, this.offset);

  case JS_SCALARTYPEREPR_INT16:
    return Load_int16(this.datum, this.offset);

  case JS_SCALARTYPEREPR_UINT16:
    return Load_uint16(this.datum, this.offset);

  case JS_SCALARTYPEREPR_INT32:
    return Load_int32(this.datum, this.offset);

  case JS_SCALARTYPEREPR_UINT32:
    return Load_uint32(this.datum, this.offset);

  case JS_SCALARTYPEREPR_FLOAT32:
    return Load_float32(this.datum, this.offset);

  case JS_SCALARTYPEREPR_FLOAT64:
    return Load_float64(this.datum, this.offset);
  }

  assert(false, "Unhandled scalar type: " + type);
  return undefined;
}

TypedObjectPointer.prototype.getReference = function() {
  var type = DESCR_TYPE(this.descr);
  switch (type) {
  case JS_REFERENCETYPEREPR_ANY:
    return Load_Any(this.datum, this.offset);

  case JS_REFERENCETYPEREPR_OBJECT:
    return Load_Object(this.datum, this.offset);

  case JS_REFERENCETYPEREPR_STRING:
    return Load_string(this.datum, this.offset);
  }

  assert(false, "Unhandled scalar type: " + type);
  return undefined;
}

TypedObjectPointer.prototype.getX4 = function() {
  var type = DESCR_TYPE(this.descr);
  switch (type) {
  case JS_X4TYPEREPR_FLOAT32:
    var x = Load_float32(this.datum, this.offset + 0);
    var y = Load_float32(this.datum, this.offset + 4);
    var z = Load_float32(this.datum, this.offset + 8);
    var w = Load_float32(this.datum, this.offset + 12);
    return GetFloat32x4TypeDescr()(x, y, z, w);

  case JS_X4TYPEREPR_INT32:
    var x = Load_int32(this.datum, this.offset + 0);
    var y = Load_int32(this.datum, this.offset + 4);
    var z = Load_int32(this.datum, this.offset + 8);
    var w = Load_int32(this.datum, this.offset + 12);
    return GetInt32x4TypeDescr()(x, y, z, w);
  }

  assert(false, "Unhandled x4 type: " + type);
  return undefined;
}

///////////////////////////////////////////////////////////////////////////
// Setting values
//
// The methods in this section modify the data pointed at by `this`.

// Assigns `fromValue` to the memory pointed at by `this`, adapting it
// to `typeRepr` as needed. This is the most general entry point and
// works for any type.
TypedObjectPointer.prototype.set = function(fromValue) {
  assert(ObjectIsAttached(this.datum), "set() called with unattached datum");

  // Fast path: `fromValue` is a typed object with same type
  // representation as the destination. In that case, we can just do a
  // memcpy.
  if (IsObject(fromValue) && ObjectIsTypedDatum(fromValue)) {
    var typeRepr = DESCR_TYPE_REPR(this.descr);
    if (!typeRepr.variable && DATUM_TYPE_REPR(fromValue) === typeRepr) {
      if (!ObjectIsAttached(fromValue))
        ThrowError(JSMSG_TYPEDOBJECT_HANDLE_UNATTACHED);

      var size = DESCR_SIZE(this.descr);
      Memcpy(this.datum, this.offset, fromValue, 0, size);
      return;
    }
  }

  switch (this.kind()) {
  case JS_TYPEREPR_SCALAR_KIND:
    this.setScalar(fromValue);
    return;

  case JS_TYPEREPR_REFERENCE_KIND:
    this.setReference(fromValue);
    return;

  case JS_TYPEREPR_X4_KIND:
    this.setX4(fromValue);
    return;

  case JS_TYPEREPR_SIZED_ARRAY_KIND:
    if (this.setArray(fromValue, DESCR_SIZED_ARRAY_LENGTH(this.descr)))
      return;
    break;

  case JS_TYPEREPR_UNSIZED_ARRAY_KIND:
    if (this.setArray(fromValue, this.datum.length))
      return;
    break;

  case JS_TYPEREPR_STRUCT_KIND:
    if (!IsObject(fromValue))
      break;

    // Adapt each field.
    var tempPtr = this.copy();
    var fieldNames = DESCR_STRUCT_FIELD_NAMES(this.descr);
    for (var i = 0; i < fieldNames.length; i++) {
      var fieldName = fieldNames[i];
      tempPtr.reset(this).moveToFieldIndex(i).set(fromValue[fieldName]);
    }
    return;
  }

  ThrowError(JSMSG_CANT_CONVERT_TO,
             typeof(fromValue),
             DescrToSource(this.descr));
}

TypedObjectPointer.prototype.setArray = function(fromValue, length) {
  if (!IsObject(fromValue))
    return false;

  // Check that "array-like" fromValue has an appropriate length.
  if (fromValue.length !== length)
    return false;

  // Adapt each element.
  if (length > 0) {
    var tempPtr = this.copy().moveToElem(0);
    var size = DESCR_SIZE(tempPtr.descr);
    for (var i = 0; i < length; i++) {
      tempPtr.set(fromValue[i]);
      tempPtr.offset += size;
    }
  }

  return true;
}

// Sets `fromValue` to `this` assuming that `this` is a scalar type.
TypedObjectPointer.prototype.setScalar = function(fromValue) {
  assert(this.kind() == JS_TYPEREPR_SCALAR_KIND,
         "setScalar called with non-scalar");

  var type = DESCR_TYPE(this.descr);
  switch (type) {
  case JS_SCALARTYPEREPR_INT8:
    return Store_int8(this.datum, this.offset,
                     TO_INT32(fromValue) & 0xFF);

  case JS_SCALARTYPEREPR_UINT8:
    return Store_uint8(this.datum, this.offset,
                      TO_UINT32(fromValue) & 0xFF);

  case JS_SCALARTYPEREPR_UINT8_CLAMPED:
    var v = ClampToUint8(+fromValue);
    return Store_int8(this.datum, this.offset, v);

  case JS_SCALARTYPEREPR_INT16:
    return Store_int16(this.datum, this.offset,
                      TO_INT32(fromValue) & 0xFFFF);

  case JS_SCALARTYPEREPR_UINT16:
    return Store_uint16(this.datum, this.offset,
                       TO_UINT32(fromValue) & 0xFFFF);

  case JS_SCALARTYPEREPR_INT32:
    return Store_int32(this.datum, this.offset,
                      TO_INT32(fromValue));

  case JS_SCALARTYPEREPR_UINT32:
    return Store_uint32(this.datum, this.offset,
                       TO_UINT32(fromValue));

  case JS_SCALARTYPEREPR_FLOAT32:
    return Store_float32(this.datum, this.offset, +fromValue);

  case JS_SCALARTYPEREPR_FLOAT64:
    return Store_float64(this.datum, this.offset, +fromValue);
  }

  assert(false, "Unhandled scalar type: " + type);
  return undefined;
}

TypedObjectPointer.prototype.setReference = function(fromValue) {
  var type = DESCR_TYPE(this.descr);
  switch (type) {
  case JS_REFERENCETYPEREPR_ANY:
    return Store_Any(this.datum, this.offset, fromValue);

  case JS_REFERENCETYPEREPR_OBJECT:
    var value = (fromValue === null ? fromValue : ToObject(fromValue));
    return Store_Object(this.datum, this.offset, value);

  case JS_REFERENCETYPEREPR_STRING:
    return Store_string(this.datum, this.offset, ToString(fromValue));
  }

  assert(false, "Unhandled scalar type: " + type);
  return undefined;
}

// Sets `fromValue` to `this` assuming that `this` is a scalar type.
TypedObjectPointer.prototype.setX4 = function(fromValue) {
  // It is only permitted to set a float32x4/int32x4 value from another
  // float32x4/int32x4; in that case, the "fast path" that uses memcopy will
  // have already matched. So if we get to this point, we're supposed
  // to "adapt" fromValue, but there are no legal adaptions.
  ThrowError(JSMSG_CANT_CONVERT_TO,
             typeof(fromValue),
             DescrToSource(this.descr));
}

///////////////////////////////////////////////////////////////////////////
// C++ Wrappers
//
// These helpers are invoked by C++ code or used as method bodies.

// Wrapper for use from C++ code.
function ConvertAndCopyTo(destDescr,
                          destDatum,
                          destOffset,
                          fromValue)
{
  assert(IsObject(destDescr) && ObjectIsTypeDescr(destDescr),
         "ConvertAndCopyTo: not type obj");
  assert(IsObject(destDatum) && ObjectIsTypedDatum(destDatum),
         "ConvertAndCopyTo: not type datum");

  if (!ObjectIsAttached(destDatum))
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_UNATTACHED);

  var ptr = new TypedObjectPointer(destDescr, destDatum, destOffset);
  ptr.set(fromValue);
}

// Wrapper for use from C++ code.
function Reify(sourceDescr,
               sourceDatum,
               sourceOffset) {
  assert(IsObject(sourceDescr) && ObjectIsTypeDescr(sourceDescr),
         "Reify: not type obj");
  assert(IsObject(sourceDatum) && ObjectIsTypedDatum(sourceDatum),
         "Reify: not type datum");

  if (!ObjectIsAttached(sourceDatum))
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_UNATTACHED);

  var ptr = new TypedObjectPointer(sourceDescr, sourceDatum, sourceOffset);

  return ptr.get();
}

function FillTypedArrayWithValue(destArray, fromValue) {
  assert(IsObject(handle) && ObjectIsTypedDatum(destArray),
         "FillTypedArrayWithValue: not typed handle");

  var descr = DATUM_TYPE_DESCR(destArray);
  var length = DESCR_SIZED_ARRAY_LENGTH(descr);
  if (length === 0)
    return;

  // Use convert and copy to to produce the first element:
  var ptr = TypedObjectPointer.fromTypedDatum(destArray);
  ptr.moveToElem(0);
  ptr.set(fromValue);

  // Stamp out the remaining copies:
  var elementSize = DESCR_SIZE(ptr.descr);
  var totalSize = length * elementSize;
  for (var offset = elementSize; offset < totalSize; offset += elementSize)
    Memcpy(destArray, offset, destArray, 0, elementSize);
}

// Warning: user exposed!
function TypeDescrEquivalent(otherDescr) {
  if (!IsObject(this) || !ObjectIsTypeDescr(this))
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "this", "type object");
  if (!IsObject(otherDescr) || !ObjectIsTypeDescr(otherDescr))
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "1", "type object");
  return DESCR_TYPE_REPR(this) === DESCR_TYPE_REPR(otherDescr);
}

// TypedArray.redimension(newArrayType)
//
// Method that "repackages" the data from this array into a new typed
// object whose type is `newArrayType`. Once you strip away all the
// outer array dimensions, the type of `this` array and `newArrayType`
// must share the same innermost element type. Moreover, those
// stripped away dimensions must amount to the same total number of
// elements.
//
// For example, given two equivalent types `T` and `U`, it is legal to
// interconvert between arrays types like:
//     T[32]
//     U[2][16]
//     U[2][2][8]
// Because they all share the same total number (32) of equivalent elements.
// But it would be illegal to convert `T[32]` to `U[31]` or `U[2][17]`, since
// the number of elements differs. And it's just plain incompatible to convert
// if the base element types are not equivalent.
//
// Warning: user exposed!
function TypedArrayRedimension(newArrayType) {
  if (!IsObject(this) || !ObjectIsTypedDatum(this))
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "this", "typed array");

  if (!IsObject(newArrayType) || !ObjectIsTypeDescr(newArrayType))
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, 1, "type object");

  // Peel away the outermost array layers from the type of `this` to find
  // the core element type. In the process, count the number of elements.
  var oldArrayType = DATUM_TYPE_DESCR(this);
  var oldArrayReprKind = DESCR_KIND(oldArrayType);
  var oldElementType = oldArrayType;
  var oldElementCount = 1;
  switch (oldArrayReprKind) {
  case JS_TYPEREPR_UNSIZED_ARRAY_KIND:
    oldElementCount *= this.length;
    oldElementType = oldElementType.elementType;
    break;

  case JS_TYPEREPR_SIZED_ARRAY_KIND:
    break;

  default:
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "this", "typed array");
  }
  while (DESCR_KIND(oldElementType) === JS_TYPEREPR_SIZED_ARRAY_KIND) {
    oldElementCount *= oldElementType.length;
    oldElementType = oldElementType.elementType;
  }

  // Peel away the outermost array layers from `newArrayType`. In the
  // process, count the number of elements.
  var newElementType = newArrayType;
  var newElementCount = 1;
  while (DESCR_KIND(newElementType) == JS_TYPEREPR_SIZED_ARRAY_KIND) {
    newElementCount *= newElementType.length;
    newElementType = newElementType.elementType;
  }

  // Check that the total number of elements does not change.
  if (oldElementCount !== newElementCount) {
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, 1,
               "New number of elements does not match old number of elements");
  }

  // Check that the element types are equivalent.
  if (DESCR_TYPE_REPR(oldElementType) !== DESCR_TYPE_REPR(newElementType)) {
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, 1,
               "New element type is not equivalent to old element type");
  }

  // Together, this should imply that the sizes are unchanged.
  assert(DESCR_SIZE(oldArrayType) == DESCR_SIZE(newArrayType),
         "Byte sizes should be equal");

  // Rewrap the data from `this` in a new type.
  return NewDerivedTypedDatum(newArrayType, this, 0);
}

///////////////////////////////////////////////////////////////////////////
// Handles
//
// Note: these methods are directly invokable by users and so must be
// defensive.

// This is the `handle([obj, [...path]])` method on type objects.
// User exposed!
//
// FIXME bug 929656 -- label algorithms with steps from the spec
function HandleCreate(obj, ...path) {
  if (!IsObject(this) || !ObjectIsTypeDescr(this))
    ThrowError(JSMSG_INCOMPATIBLE_PROTO, "Type", "handle", "value");

  switch (DESCR_KIND(this)) {
  case JS_TYPEREPR_SCALAR_KIND:
  case JS_TYPEREPR_REFERENCE_KIND:
  case JS_TYPEREPR_X4_KIND:
  case JS_TYPEREPR_SIZED_ARRAY_KIND:
  case JS_TYPEREPR_STRUCT_KIND:
    break;

  case JS_TYPEREPR_UNSIZED_ARRAY_KIND:
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_TO_UNSIZED);
  }

  var handle = NewTypedHandle(this);

  if (obj !== undefined)
    HandleMoveInternal(handle, obj, path);

  return handle;
}

// Handle.move: user exposed!
// FIXME bug 929656 -- label algorithms with steps from the spec
function HandleMove(handle, obj, ...path) {
  if (!IsObject(handle) || !ObjectIsTypedHandle(handle))
    ThrowError(JSMSG_INCOMPATIBLE_PROTO, "Handle", "set", typeof value);

  HandleMoveInternal(handle, obj, path);
}

function HandleMoveInternal(handle, obj, path) {
  assert(IsObject(handle) && ObjectIsTypedHandle(handle),
         "HandleMoveInternal: not typed handle");

  if (!IsObject(obj) || !ObjectIsTypedDatum(obj))
    ThrowError(JSMSG_INCOMPATIBLE_PROTO, "Handle", "set", "value");

  var ptr = TypedObjectPointer.fromTypedDatum(obj);
  for (var i = 0; i < path.length; i++)
    ptr.moveTo(path[i]);

  // Check that the new destination is equivalent to the handle type.
  if (DESCR_TYPE_REPR(ptr.descr) !== DATUM_TYPE_REPR(handle))
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_TYPE);

  AttachHandle(handle, ptr.datum, ptr.offset)
}

// Handle.get: user exposed!
// FIXME bug 929656 -- label algorithms with steps from the spec
function HandleGet(handle) {
  if (!IsObject(handle) || !ObjectIsTypedHandle(handle))
    ThrowError(JSMSG_INCOMPATIBLE_PROTO, "Handle", "set", typeof value);

  if (!ObjectIsAttached(handle))
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_UNATTACHED);

  var ptr = TypedObjectPointer.fromTypedDatum(handle);
  return ptr.get();
}

// Handle.set: user exposed!
// FIXME bug 929656 -- label algorithms with steps from the spec
function HandleSet(handle, value) {
  if (!IsObject(handle) || !ObjectIsTypedHandle(handle))
    ThrowError(JSMSG_INCOMPATIBLE_PROTO, "Handle", "set", typeof value);

  if (!ObjectIsAttached(handle))
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_UNATTACHED);

  var ptr = TypedObjectPointer.fromTypedDatum(handle);
  ptr.set(value);
}

// Handle.isHandle: user exposed!
// FIXME bug 929656 -- label algorithms with steps from the spec
function HandleTest(obj) {
  return IsObject(obj) && ObjectIsTypedHandle(obj);
}

///////////////////////////////////////////////////////////////////////////
// X4

function X4ProtoString(type) {
  switch (type) {
  case JS_X4TYPEREPR_INT32:
    return "int32x4";
  case JS_X4TYPEREPR_FLOAT32:
    return "float32x4";
  }

  assert(false, "Unhandled type constant");
  return undefined;
}

function X4ToSource() {
  if (!IsObject(this) || !ObjectIsTypedDatum(this))
    ThrowError(JSMSG_INCOMPATIBLE_PROTO, "X4", "toSource", typeof this);

  if (DESCR_KIND(this) != JS_TYPEREPR_X4_KIND)
    ThrowError(JSMSG_INCOMPATIBLE_PROTO, "X4", "toSource", typeof this);

  var descr = DATUM_TYPE_DESCR(this);
  var type = DESCR_TYPE(descr);
  return X4ProtoString(type)+"("+this.x+", "+this.y+", "+this.z+", "+this.w+")";
}

///////////////////////////////////////////////////////////////////////////
// Miscellaneous

// Warning: user exposed!
function ArrayShorthand(...dims) {
  if (!IsObject(this) || !ObjectIsTypeDescr(this))
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS,
               "this", "typed object");

  var T = GetTypedObjectModule();

  if (dims.length == 0)
    return new T.ArrayType(this);

  var accum = this;
  for (var i = dims.length - 1; i >= 0; i--)
    accum = new T.ArrayType(accum).dimension(dims[i]);
  return accum;
}

// This is the `objectType()` function defined in the spec.
// It returns the type of its argument.
//
// Warning: user exposed!
function TypeOfTypedDatum(obj) {
  if (IsObject(obj) && ObjectIsTypedDatum(obj))
    return DATUM_TYPE_DESCR(obj);

  // Note: Do not create bindings for `Any`, `String`, etc in
  // Utilities.js, but rather access them through
  // `GetTypedObjectModule()`. The reason is that bindings
  // you create in Utilities.js are part of the self-hosted global,
  // vs the user-accessible global, and hence should not escape to
  // user script.
  var T = GetTypedObjectModule();
  switch (typeof obj) {
    case "object": return T.Object;
    case "function": return T.Object;
    case "string": return T.String;
    case "number": return T.float64;
    case "undefined": return T.Any;
    default: return T.Any;
  }
}

function ObjectIsTypedDatum(obj) {
  assert(IsObject(obj), "ObjectIsTypedDatum invoked with non-object")
  return ObjectIsTypedObject(obj) || ObjectIsTypedHandle(obj);
}

function ObjectIsAttached(obj) {
  assert(IsObject(obj), "ObjectIsAttached invoked with non-object")
  assert(ObjectIsTypedDatum(obj),
         "ObjectIsAttached() invoked on invalid obj");
  return DATUM_OWNER(obj) != null;
}

///////////////////////////////////////////////////////////////////////////
// TypedObject surface API methods (sequential implementations).

// Warning: user exposed!
function TypedObjectArrayTypeBuild(a,b,c) {
  // Arguments (this sized) : [depth], func
  // Arguments (this unsized) : length, [depth], func

  if (!IsObject(this) || !ObjectIsTypeDescr(this))
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "this", "type object");
  var kind = DESCR_KIND(this);
  switch (kind) {
  case JS_TYPEREPR_SIZED_ARRAY_KIND:
    if (typeof a === "function") // XXX here and elsewhere: these type dispatches are fragile at best.
      return BuildTypedSeqImpl(this, this.length, 1, a);
    else if (typeof a === "number" && typeof b === "function")
      return BuildTypedSeqImpl(this, this.length, a, b);
    else if (typeof a === "number")
      return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "2", "function");
    else
      return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "1", "function");
  case JS_TYPEREPR_UNSIZED_ARRAY_KIND:
    var len = a;
    if (typeof b === "function")
      return BuildTypedSeqImpl(this, len, 1, b);
    else if (typeof b === "number" && typeof c === "function")
      return BuildTypedSeqImpl(this, len, b, c);
    else if (typeof b === "number")
      return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "3", "function");
    else
      return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "2", "function");
  default:
    return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "this", "type object");
  }
}

// Warning: user exposed!
function TypedObjectArrayTypeFrom(a, b, c) {
  // Arguments: arrayLike, [depth], func

  if (!IsObject(this) || !ObjectIsTypeDescr(this))
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "this", "type object");

  var untypedInput = !IsObject(a) || !ObjectIsTypedDatum(a);

  // for untyped input array, the expectation (in terms of error
  // reporting for invalid parameters) is no-depth, despite
  // supporting an explicit depth of 1; while for typed input array,
  // the expectation is explicit depth.


  if (untypedInput) {
    var explicitDepth = (b === 1);
    if (explicitDepth && IsCallable(c))
      return MapUntypedSeqImpl(a, this, c);
    else if (IsCallable(b))
      return MapUntypedSeqImpl(a, this, b);
    else
      return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "2", "function");
  } else {
    var explicitDepth = (typeof b === "number");
    if (explicitDepth && IsCallable(c))
      return MapTypedSeqImpl(a, b, this, c);
    else if (IsCallable(b))
      return MapTypedSeqImpl(a, 1, this, b);
    else if (explicitDepth)
      return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "3", "function");
    else
      return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "2", "number");
  }
}

// Warning: user exposed!
function TypedArrayMap(a, b) {
  if (!IsObject(this) || !ObjectIsTypedDatum(this))
    return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "this", "typed array");
  var thisType = DATUM_TYPE_DESCR(this);
  if (!TypeDescrIsArrayType(thisType))
    return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "this", "typed array");

  // Arguments: [depth], func
  if (typeof a === "number" && typeof b === "function")
    return MapTypedSeqImpl(this, a, thisType, b);
  else if (typeof a === "function")
    return MapTypedSeqImpl(this, 1, thisType, a);
  else if (typeof a === "number")
    return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "3", "function");
  else
    return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "2", "function");
}

// Warning: user exposed!
function TypedArrayReduce(a, b) {
  // Arguments: func, [initial]
  if (!IsObject(this) || !ObjectIsTypedDatum(this))
    return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "this", "typed array");
  var thisType = DATUM_TYPE_DESCR(this);
  if (!TypeDescrIsArrayType(thisType))
    return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "this", "typed array");

  if (a !== undefined && typeof a !== "function")
    return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "1", "function");

  var outputType = thisType.elementType;
  return ReduceTypedSeqImpl(this, outputType, a, b);
}

// Warning: user exposed!
function TypedArrayScatter(a, b, c, d) {
  // Arguments: outputArrayType, indices, defaultValue, conflictFunction
  if (!IsObject(this) || !ObjectIsTypedDatum(this))
    return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "this", "typed array");
  var thisType = DATUM_TYPE_DESCR(this);
  if (!TypeDescrIsArrayType(thisType))
    return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "this", "typed array");

  if (!IsObject(a) || !ObjectIsTypeDescr(a) || !TypeDescrIsSizedArrayType(a))
    return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "1", "sized array type");

  if (d !== undefined && typeof d !== "function")
    return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "4", "function");

  return ScatterTypedSeqImpl(this, a, b, c, d);
}

// Warning: user exposed!
function TypedArrayFilter(func) {
  // Arguments: predicate
  if (!IsObject(this) || !ObjectIsTypedDatum(this))
    return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "this", "typed array");
  var thisType = DATUM_TYPE_DESCR(this);
  if (!TypeDescrIsArrayType(thisType))
    return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "this", "typed array");

  if (typeof func !== "function")
    return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "1", "function");

  return FilterTypedSeqImpl(this, func);
}

// placeholders

// Warning: user exposed!
function TypedObjectArrayTypeBuildPar(a,b,c) {
  return callFunction(TypedObjectArrayTypeBuild, this, a, b, c);
}

// Warning: user exposed!
function TypedObjectArrayTypeFromPar(a,b,c) {
  return callFunction(TypedObjectArrayTypeFrom, this, a, b, c);
}

// Warning: user exposed!
function TypedArrayMapPar(a, b) {
  return callFunction(TypedArrayMap, this, a, b);
}

// Warning: user exposed!
function TypedArrayReducePar(a, b) {
  return callFunction(TypedArrayReduce, this, a, b);
}

// Warning: user exposed!
function TypedArrayScatterPar(a, b, c, d) {
  return callFunction(TypedArrayScatter, this, a, b, c, d);
}

// Warning: user exposed!
function TypedArrayFilterPar(func) {
  return callFunction(TypedArrayFilter, this, func);
}

// should eventually become macros
function NUM_BYTES(bits) {
  return (bits + 7) >> 3;
}
function SET_BIT(data, index) {
  var word = index >> 3;
  var mask = 1 << (index & 0x7);
  data[word] |= mask;
}
function GET_BIT(data, index) {
  var word = index >> 3;
  var mask = 1 << (index & 0x7);
  return (data[word] & mask) != 0;
}

function TypeDescrIsArrayType(t) {
  assert(IsObject(t) && ObjectIsTypeDescr(t), "TypeDescrIsArrayType called on non-type-object");

  var kind = DESCR_KIND(t);
  switch (kind) {
  case JS_TYPEREPR_SIZED_ARRAY_KIND:
  case JS_TYPEREPR_UNSIZED_ARRAY_KIND:
    return true;
  case JS_TYPEREPR_SCALAR_KIND:
  case JS_TYPEREPR_REFERENCE_KIND:
  case JS_TYPEREPR_X4_KIND:
  case JS_TYPEREPR_STRUCT_KIND:
    return false;
  default:
    return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, 1, "unknown kind of typed object");
  }
}

function TypeDescrIsSizedArrayType(t) {
  assert(IsObject(t) && ObjectIsTypeDescr(t), "TypeDescrIsSizedArrayType called on non-type-object");

  var kind = DESCR_KIND(t);
  switch (kind) {
  case JS_TYPEREPR_SIZED_ARRAY_KIND:
    return true;
  case JS_TYPEREPR_UNSIZED_ARRAY_KIND:
  case JS_TYPEREPR_SCALAR_KIND:
  case JS_TYPEREPR_REFERENCE_KIND:
  case JS_TYPEREPR_X4_KIND:
  case JS_TYPEREPR_STRUCT_KIND:
    return false;
  default:
    return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, 1, "unknown kind of typed object");
  }
}

function TypeDescrIsSimpleType(t) {
  assert(IsObject(t) && ObjectIsTypeDescr(t), "TypeDescrIsSimpleType called on non-type-object");

  var kind = DESCR_KIND(t);
  switch (kind) {
  case JS_TYPEREPR_SCALAR_KIND:
  case JS_TYPEREPR_REFERENCE_KIND:
  case JS_TYPEREPR_X4_KIND:
    return true;
  case JS_TYPEREPR_SIZED_ARRAY_KIND:
  case JS_TYPEREPR_UNSIZED_ARRAY_KIND:
  case JS_TYPEREPR_STRUCT_KIND:
    return false;
  default:
    return ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, 1, "unknown kind of typed object");
  }
}

// Bug 956914: make performance-tuned variants tailored to 1, 2, and 3 dimensions.
function BuildTypedSeqImpl(arrayType, len, depth, func) {
  assert(IsObject(arrayType) && ObjectIsTypeDescr(arrayType), "Build called on non-type-object");

  if (depth <= 0 || TO_INT32(depth) !== depth)
    // RangeError("bad depth")
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "depth", "positive int");

  // For example, if we have as input
  //    ArrayType(ArrayType(T, 4), 5)
  // and a depth of 2, we get
  //    grainType = T
  //    iterationSpace = [5, 4]
  var [iterationSpace, grainType, totalLength] =
    ComputeIterationSpace(arrayType, depth, len);

  // Create a zeroed instance with no data
  var result = arrayType.variable ? new arrayType(len) : new arrayType();

  var indices = NewDenseArray(depth);
  for (var i = 0; i < depth; i++) {
    indices[i] = 0;
  }

  var handle = callFunction(HandleCreate, grainType);
  var offset = 0;
  for (i = 0; i < totalLength; i++) {
    // Position handle to point at &result[...indices]
    AttachHandle(handle, result, offset);

    // Invoke func(...indices, out)
    callFunction(std_Array_push, indices, handle);
    var r = callFunction(std_Function_apply, func, void 0, indices);
    callFunction(std_Array_pop, indices);

    if (r !== undefined) {
      // result[...indices] = r;
      AttachHandle(handle, result, offset); // (func might have moved handle)
      HandleSet(handle, r);                 // *handle = r
    }
    // Increment indices.
    offset += DESCR_SIZE(grainType);
    IncrementIterationSpace(indices, iterationSpace);
  }

  return result;
}

function ComputeIterationSpace(arrayType, depth, len) {
  assert(IsObject(arrayType) && ObjectIsTypeDescr(arrayType), "ComputeIterationSpace called on non-type-object");
  assert(TypeDescrIsArrayType(arrayType), "ComputeIterationSpace called on non-array-type");
  assert(depth > 0, "ComputeIterationSpace called on non-positive depth");
  var iterationSpace = NewDenseArray(depth);
  iterationSpace[0] = len;
  var totalLength = len;
  var grainType = arrayType.elementType;

  for (var i = 1; i < depth; i++) {
    if (TypeDescrIsArrayType(grainType)) {
      var grainLen = grainType.length;
      iterationSpace[i] = grainLen;
      totalLength *= grainLen;
      grainType = grainType.elementType;
    } else {
      // RangeError("Depth "+depth+" too high");
      ThrowError(JSMSG_TYPEDOBJECT_ARRAYTYPE_BAD_ARGS);
    }
  }
  return [iterationSpace, grainType, totalLength];
}

function IncrementIterationSpace(indices, iterationSpace) {
  // Increment something like
  //     [5, 5, 7, 8]
  // in an iteration space of
  //     [9, 9, 9, 9]
  // to
  //     [5, 5, 8, 0]

  assert(indices.length === iterationSpace.length,
         "indices dimension must equal iterationSpace dimension.");
  var n = indices.length - 1;
  while (true) {
    indices[n] += 1;
    if (indices[n] < iterationSpace[n])
      return;

    assert(indices[n] === iterationSpace[n],
         "Components of indices must match those of iterationSpace.");
    indices[n] = 0;
    if (n == 0)
      return;

    n -= 1;
  }
}

// Implements |from| method for untyped |inArray|.  (Depth is implicitly 1 for untyped input.)
function MapUntypedSeqImpl(inArray, outputType, maybeFunc) {
  assert(IsObject(outputType), "1. Map/From called on non-object outputType");
  assert(ObjectIsTypeDescr(outputType), "1. Map/From called on non-type-object outputType");
  inArray = ToObject(inArray);
  assert(TypeDescrIsArrayType(outputType), "Map/From called on non array-type outputType");

  if (!IsCallable(maybeFunc))
    ThrowError(JSMSG_NOT_FUNCTION, DecompileArg(0, maybeFunc));
  var func = maybeFunc;

  // Skip check for compatible iteration spaces; any normal JS array
  // is trivially compatible with any iteration space of depth 1.

  var outLength = outputType.variable ? inArray.length : outputType.length;
  var outGrainType = outputType.elementType;

  // Create a zeroed instance with no data
  var result = outputType.variable ? new outputType(inArray.length) : new outputType();

  var outHandle = callFunction(HandleCreate, outGrainType);
  var outUnitSize = DESCR_SIZE(outGrainType);

  // Core of map computation starts here (comparable to
  // DoMapTypedSeqDepth1 and DoMapTypedSeqDepthN below).

  var offset = 0;
  for (var i = 0; i < outLength; i++) {
    // In this loop, since depth is 1, "indices" denotes singleton array [i].

    // Adjust handle to point at &array[...indices] for result array.
    AttachHandle(outHandle, result, offset);

    if (i in inArray) { // Check for holes (only needed for untyped case).

      // Extract element value (no input handles for untyped case).
      var element = inArray[i];

      // Invoke: var r = func(element, ...indices, collection, out);
      var r = func(element, i, inArray, outHandle);

      if (r !== undefined) {
        AttachHandle(outHandle, result, offset); // (func could move handle)
        HandleSet(outHandle, r); // *handle = r; (i.e. result[i] = r).
      }
    }

    // Update offset and (implicitly) increment indices.
    offset += outUnitSize;
  }

  return result;
}

// Implements |map| and |from| methods for typed |inArray|.
function MapTypedSeqImpl(inArray, depth, outputType, func) {
  assert(IsObject(outputType) && ObjectIsTypeDescr(outputType), "2. Map/From called on non-type-object outputType");
  assert(IsObject(inArray) && ObjectIsTypedDatum(inArray), "Map/From called on non-object or untyped input array.");
  assert(TypeDescrIsArrayType(outputType), "Map/From called on non array-type outputType");

  if (depth <= 0 || TO_INT32(depth) !== depth)
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "depth", "positive int");

  // Compute iteration space for input and output and check for compatibility.
  var inputType = TypeOfTypedDatum(inArray);
  var [inIterationSpace, inGrainType, _] =
    ComputeIterationSpace(inputType, depth, inArray.length);
  if (!IsObject(inGrainType) || !ObjectIsTypeDescr(inGrainType))
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, 1, "type object");
  var [iterationSpace, outGrainType, totalLength] =
    ComputeIterationSpace(outputType, depth, outputType.variable ? inArray.length : outputType.length);
  for (var i = 0; i < depth; i++)
    if (inIterationSpace[i] !== iterationSpace[i])
      // TypeError("Incompatible iteration space in input and output type");
      ThrowError(JSMSG_TYPEDOBJECT_ARRAYTYPE_BAD_ARGS);

  // Create a zeroed instance with no data
  var result = outputType.variable ? new outputType(inArray.length) : new outputType();

  var inHandle = callFunction(HandleCreate, inGrainType);
  var outHandle = callFunction(HandleCreate, outGrainType);
  var inUnitSize = DESCR_SIZE(inGrainType);
  var outUnitSize = DESCR_SIZE(outGrainType);

  var inGrainTypeIsSimple = TypeDescrIsSimpleType(inGrainType);

  // Bug 956914: add additional variants for depth = 2, 3, etc.

  function DoMapTypedSeqDepth1() {
    var inOffset = 0;
    var outOffset = 0;

    for (var i = 0; i < totalLength; i++) {
      // In this loop, since depth is 1, "indices" denotes singleton array [i].

      // Adjust handles to point at &array[...indices] for in and out array.
      AttachHandle(inHandle, inArray, inOffset);
      AttachHandle(outHandle, result, outOffset);

      // Extract element value if simple; if not, handle acts as array element.
      var element = (inGrainTypeIsSimple ? HandleGet(inHandle) : inHandle);

      // Invoke: var r = func(element, ...indices, collection, out);
      var r = func(element, i, inArray, outHandle);

      if (r !== undefined) {
        AttachHandle(outHandle, result, outOffset); // (func could move handle)
        HandleSet(outHandle, r); // *handle = r; (i.e. result[i] = r).
      }

      // Update offsets and (implicitly) increment indices.
      inOffset += inUnitSize;
      outOffset += outUnitSize;
    }

    return result;
  }

  function DoMapTypedSeqDepthN() {
    var indices = new Uint32Array(depth);

    var inOffset = 0;
    var outOffset = 0;
    for (var i = 0; i < totalLength; i++) {
      // Adjust handles to point at &array[...indices] for in and out array.
      AttachHandle(inHandle, inArray, inOffset);
      AttachHandle(outHandle, result, outOffset);

      // Extract element value if simple; if not, handle acts as array element.
      var element = (inGrainTypeIsSimple ? HandleGet(inHandle) : inHandle);

      // Invoke: var r = func(element, ...indices, collection, out);
      var args = [element];
      callFunction(std_Function_apply, std_Array_push, args, indices);
      callFunction(std_Array_push, args, inArray, outHandle);
      var r = callFunction(std_Function_apply, func, void 0, args);

      if (r !== undefined) {
        AttachHandle(outHandle, result, outOffset); // (func could move handle)
        HandleSet(outHandle, r);                    // *handle = r
      }

      // Update offsets and explicitly increment indices.
      inOffset += inUnitSize;
      outOffset += outUnitSize;
      IncrementIterationSpace(indices, iterationSpace);
    }

    return result;
  }

  if  (depth == 1) {
    return DoMapTypedSeqDepth1();
  } else {
    return DoMapTypedSeqDepthN();
  }

}

function ReduceTypedSeqImpl(array, outputType, func, initial) {
  assert(IsObject(array) && ObjectIsTypedDatum(array), "Reduce called on non-object or untyped input array.");
  assert(IsObject(outputType) && ObjectIsTypeDescr(outputType), "Reduce called on non-type-object outputType");

  var start, value;

  if (initial === undefined && array.length < 1)
    // RangeError("reduce requires array of length > 0")
    ThrowError(JSMSG_TYPEDOBJECT_ARRAYTYPE_BAD_ARGS);

  // FIXME bug 950106 Should reduce method supply an outptr handle?
  // For now, reduce never supplies an outptr, regardless of outputType.

  if (TypeDescrIsSimpleType(outputType)) {
    if (initial === undefined) {
      start = 1;
      value = array[0];
    } else {
      start = 0;
      value = outputType(initial);
    }

    for (var i = start; i < array.length; i++)
      value = outputType(func(value, array[i]));

  } else {
    if (initial === undefined) {
      start = 1;
      value = new outputType(array[0]);
    } else {
      start = 0;
      value = initial;
    }

    for (var i = start; i < array.length; i++)
      value = func(value, array[i]);
  }

  return value;
}

function ScatterTypedSeqImpl(array, outputType, indices, defaultValue, conflictFunc) {
  assert(IsObject(array) && ObjectIsTypedDatum(array), "Scatter called on non-object or untyped input array.");
  assert(IsObject(outputType) && ObjectIsTypeDescr(outputType), "Scatter called on non-type-object outputType");
  assert(TypeDescrIsSizedArrayType(outputType), "Scatter called on non-sized array type");
  assert(conflictFunc === undefined || typeof conflictFunc === "function", "Scatter called with invalid conflictFunc");

  var result = new outputType();
  var bitvec = new Uint8Array(result.length);
  var elemType = outputType.elementType;
  var i, j;
  if (defaultValue !== elemType(undefined)) {
    for (i = 0; i < result.length; i++) {
      result[i] = defaultValue;
    }
  }

  for (i = 0; i < indices.length; i++) {
    j = indices[i];
    if (!GET_BIT(bitvec, j)) {
      result[j] = array[i];
      SET_BIT(bitvec, j);
    } else if (conflictFunc === undefined) {
      ThrowError(JSMSG_PAR_ARRAY_SCATTER_CONFLICT);
    } else {
      result[j] = conflictFunc(result[j], elemType(array[i]));
    }
  }
  return result;
}

function FilterTypedSeqImpl(array, func) {
  assert(IsObject(array) && ObjectIsTypedDatum(array), "Filter called on non-object or untyped input array.");
  assert(typeof func === "function", "Filter called with non-function predicate");

  var arrayType = TypeOfTypedDatum(array);
  if (!TypeDescrIsArrayType(arrayType))
    ThrowError(JSMSG_TYPEDOBJECT_HANDLE_BAD_ARGS, "this", "typed array");

  var elementType = arrayType.elementType;
  var flags = new Uint8Array(NUM_BYTES(array.length));
  var handle = callFunction(HandleCreate, elementType);
  var count = 0;
  for (var i = 0; i < array.length; i++) {
    HandleMove(handle, array, i);
    if (func(HandleGet(handle), i, array)) {
      SET_BIT(flags, i);
      count++;
    }
  }

  var resultType = (arrayType.variable ? arrayType : arrayType.unsized);
  var result = new resultType(count);
  for (var i = 0, j = 0; i < array.length; i++) {
    if (GET_BIT(flags, i))
      result[j++] = array[i];
  }
  return result;
}
