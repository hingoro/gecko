/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_GFX_DATASOURCESURFACEWRAPPER_H_
#define MOZILLA_GFX_DATASOURCESURFACEWRAPPER_H_

#include "2D.h"

namespace mozilla {
namespace gfx {

// Wraps a DataSourceSurface and forwards all methods except for GetType(),
// from which it always returns SurfaceType::DATA.
class DataSourceSurfaceWrapper final : public DataSourceSurface
{
public:
  MOZ_DECLARE_REFCOUNTED_VIRTUAL_TYPENAME(DataSourceSurfaceWrapper, override)
  explicit DataSourceSurfaceWrapper(DataSourceSurface *aSurface)
   : mSurface(aSurface)
  {}

  bool Equals(SourceSurface* aOther, bool aSymmetric = true) override
  {
    return DataSourceSurface::Equals(aOther, aSymmetric) ||
           mSurface->Equals(aOther, aSymmetric);
  }

  virtual SurfaceType GetType() const override { return SurfaceType::DATA; }

  virtual uint8_t *GetData() override { return mSurface->GetData(); }
  virtual int32_t Stride() override { return mSurface->Stride(); }
  virtual IntSize GetSize() const override { return mSurface->GetSize(); }
  virtual SurfaceFormat GetFormat() const override { return mSurface->GetFormat(); }
  virtual bool IsValid() const override { return mSurface->IsValid(); }

  bool Map(MapType aType, MappedSurface *aMappedSurface) override
  {
    return mSurface->Map(aType, aMappedSurface);
  }

  void Unmap() override { mSurface->Unmap(); }

private:
  RefPtr<DataSourceSurface> mSurface;
};

} // namespace gfx
} // namespace mozilla

#endif /* MOZILLA_GFX_DATASOURCESURFACEWRAPPER_H_ */
