// FILE SINH TU DONG boi scripts/shotcraft-sync.mjs — KHONG SUA TAY.
import type React from 'react'
import type { ShotMeta } from './meta'
import { Basic3DScene as C0 } from './shots/camera/basic-3d-scene/Basic3DScene'
import M0 from './shots/camera/basic-3d-scene/Basic3DScene.meta.json'
import { CrashImpactReal as C1 } from './shots/camera/crash-zoom-punch/CrashImpactReal'
import M1 from './shots/camera/crash-zoom-punch/CrashImpactReal.meta.json'
import { CrashZoomReal as C2 } from './shots/camera/crash-zoom-punch/CrashZoomReal'
import M2 from './shots/camera/crash-zoom-punch/CrashZoomReal.meta.json'
import { CursorFlyover as C3 } from './shots/camera/cursor-flyover/CursorFlyover'
import M3 from './shots/camera/cursor-flyover/CursorFlyover.meta.json'
import { MultiplaneReal as C4 } from './shots/camera/depth-layer-moves/MultiplaneReal'
import M4 from './shots/camera/depth-layer-moves/MultiplaneReal.meta.json'
import { GrazeFaceTour as C5 } from './shots/camera/graze-face-tour/GrazeFaceTour'
import M5 from './shots/camera/graze-face-tour/GrazeFaceTour.meta.json'
import { OverheadTabletopDrop as C6 } from './shots/camera/overhead-camera-moves/OverheadTabletopDrop'
import M6 from './shots/camera/overhead-camera-moves/OverheadTabletopDrop.meta.json'
import { TiltReveal as C7 } from './shots/camera/overhead-camera-moves/TiltReveal'
import M7 from './shots/camera/overhead-camera-moves/TiltReveal.meta.json'
import { DroneDiveLanding as C8 } from './shots/camera/space-camera-moves/DroneDiveLanding'
import M8 from './shots/camera/space-camera-moves/DroneDiveLanding.meta.json'
import { ExplodedView as C9 } from './shots/camera/space-camera-moves/ExplodedView'
import M9 from './shots/camera/space-camera-moves/ExplodedView.meta.json'
import { SteepTiltGlide as C10 } from './shots/camera/steep-tilt-glide/SteepTiltGlide'
import M10 from './shots/camera/steep-tilt-glide/SteepTiltGlide.meta.json'
import { BulletTimeFreezeOrbit as C11 } from './shots/camera/tension-camera-moves/BulletTimeFreezeOrbit'
import M11 from './shots/camera/tension-camera-moves/BulletTimeFreezeOrbit.meta.json'
import { PullBackIsolation as C12 } from './shots/camera/tension-camera-moves/PullBackIsolation'
import M12 from './shots/camera/tension-camera-moves/PullBackIsolation.meta.json'
import { Terminal3D as C13 } from './shots/camera/terminal-3d/Terminal3D'
import M13 from './shots/camera/terminal-3d/Terminal3D.meta.json'
import { BeforeAfterSliderScrub as C14 } from './shots/data/before-after-slider-scrub/BeforeAfterSliderScrub'
import M14 from './shots/data/before-after-slider-scrub/BeforeAfterSliderScrub.meta.json'
import { AxisRescaleShockV2 as C15 } from './shots/data/chart-live-moves/AxisRescaleShockV2'
import M15 from './shots/data/chart-live-moves/AxisRescaleShockV2.meta.json'
import { OscilloscopeStreamV2 as C16 } from './shots/data/chart-live-moves/OscilloscopeStreamV2'
import M16 from './shots/data/chart-live-moves/OscilloscopeStreamV2.meta.json'
import { UnitDotSwarmRegroupV2 as C17 } from './shots/data/chart-live-moves/UnitDotSwarmRegroupV2'
import M17 from './shots/data/chart-live-moves/UnitDotSwarmRegroupV2.meta.json'
import { NeedleSweepSelftest as C18 } from './shots/data/gauge-readout-moves/NeedleSweepSelftest'
import M18 from './shots/data/gauge-readout-moves/NeedleSweepSelftest.meta.json'
import { TapeScrollFixedPointer as C19 } from './shots/data/gauge-readout-moves/TapeScrollFixedPointer'
import M19 from './shots/data/gauge-readout-moves/TapeScrollFixedPointer.meta.json'
import { BrakeReticleLock as C20 } from './shots/data/scroll-brake-moves/BrakeReticleLock'
import M20 from './shots/data/scroll-brake-moves/BrakeReticleLock.meta.json'
import { ChangelogScrollBrake as C21 } from './shots/data/scroll-brake-moves/ChangelogScrollBrake'
import M21 from './shots/data/scroll-brake-moves/ChangelogScrollBrake.meta.json'
import { TimelineTravel as C22 } from './shots/data/timeline-travel/TimelineTravel'
import M22 from './shots/data/timeline-travel/TimelineTravel.meta.json'
import { AssembleThenTypeFlyin as C23 } from './shots/effects/assemble-then-type-flyin/AssembleThenTypeFlyin'
import M23 from './shots/effects/assemble-then-type-flyin/AssembleThenTypeFlyin.meta.json'
import { AuroraBloomBgFlip as C24 } from './shots/effects/aurora-bloom-bg-flip/AuroraBloomBgFlip'
import M24 from './shots/effects/aurora-bloom-bg-flip/AuroraBloomBgFlip.meta.json'
import { BrandFrameSnap as C25 } from './shots/effects/brand-frame-snap/BrandFrameSnap'
import M25 from './shots/effects/brand-frame-snap/BrandFrameSnap.meta.json'
import { ReticleLockOn as C26 } from './shots/effects/fui-hud-moves/ReticleLockOn'
import M26 from './shots/effects/fui-hud-moves/ReticleLockOn.meta.json'
import { FlylineArc as C27 } from './shots/effects/glow-flyline-moves/FlylineArc'
import M27 from './shots/effects/glow-flyline-moves/FlylineArc.meta.json'
import { GlowOrbAmbient as C28 } from './shots/effects/glow-flyline-moves/GlowOrbAmbient'
import M28 from './shots/effects/glow-flyline-moves/GlowOrbAmbient.meta.json'
import { OrbFlylineRelay as C29 } from './shots/effects/glow-flyline-moves/OrbFlylineRelay'
import M29 from './shots/effects/glow-flyline-moves/OrbFlylineRelay.meta.json'
import { AttentionBounce as C30 } from './shots/effects/icon-performance-moves/AttentionBounce'
import M30 from './shots/effects/icon-performance-moves/AttentionBounce.meta.json'
import { AnimeImpact as C31 } from './shots/effects/impact-feedback/AnimeImpact'
import M31 from './shots/effects/impact-feedback/AnimeImpact.meta.json'
import { HitCounter as C32 } from './shots/effects/impact-feedback/HitCounter'
import M32 from './shots/effects/impact-feedback/HitCounter.meta.json'
import { SheenSweepRetry as C33 } from './shots/effects/light-play-moves/SheenSweepRetry'
import M33 from './shots/effects/light-play-moves/SheenSweepRetry.meta.json'
import { SpotlightSweepReveal as C34 } from './shots/effects/light-play-moves/SpotlightSweepReveal'
import M34 from './shots/effects/light-play-moves/SpotlightSweepReveal.meta.json'
import { RadialRipplePhoneChips as C35 } from './shots/effects/radial-ripple-phone-chips/RadialRipplePhoneChips'
import M35 from './shots/effects/radial-ripple-phone-chips/RadialRipplePhoneChips.meta.json'
import { RisoMisregistrationHit as C36 } from './shots/effects/riso-print-hits/RisoMisregistrationHit'
import M36 from './shots/effects/riso-print-hits/RisoMisregistrationHit.meta.json'
import { ScanBracketSweep as C37 } from './shots/effects/scan-bracket-sweep/ScanBracketSweep'
import M37 from './shots/effects/scan-bracket-sweep/ScanBracketSweep.meta.json'
import { ScanlineAnnotateFocus as C38 } from './shots/effects/scanline-annotate-focus/ScanlineAnnotateFocus'
import M38 from './shots/effects/scanline-annotate-focus/ScanlineAnnotateFocus.meta.json'
import { ScanlineAssembleFlyin as C39 } from './shots/effects/scanline-assemble-flyin/ScanlineAssembleFlyin'
import M39 from './shots/effects/scanline-assemble-flyin/ScanlineAssembleFlyin.meta.json'
import { ImpactBurstKit as C40 } from './shots/effects/slam-entrance-moves/ImpactBurstKit'
import M40 from './shots/effects/slam-entrance-moves/ImpactBurstKit.meta.json'
import { KanadaPerspectiveSnap as C41 } from './shots/effects/slam-entrance-moves/KanadaPerspectiveSnap'
import M41 from './shots/effects/slam-entrance-moves/KanadaPerspectiveSnap.meta.json'
import { ScoreSlam as C42 } from './shots/effects/slam-entrance-moves/ScoreSlam'
import M42 from './shots/effects/slam-entrance-moves/ScoreSlam.meta.json'
import { CornerSpotlightReveal as C43 } from './shots/effects/spotlight-sweep-moves/CornerSpotlightReveal'
import M43 from './shots/effects/spotlight-sweep-moves/CornerSpotlightReveal.meta.json'
import { GlowWakeSleepPanel as C44 } from './shots/effects/spotlight-sweep-moves/GlowWakeSleepPanel'
import M44 from './shots/effects/spotlight-sweep-moves/GlowWakeSleepPanel.meta.json'
import { SlideSpotlightPan as C45 } from './shots/effects/spotlight-sweep-moves/SlideSpotlightPan'
import M45 from './shots/effects/spotlight-sweep-moves/SlideSpotlightPan.meta.json'
import { AutolayoutGapDial as C46 } from './shots/interaction/autolayout-gap-dial/AutolayoutGapDial'
import M46 from './shots/interaction/autolayout-gap-dial/AutolayoutGapDial.meta.json'
import { DiagramCascadeBuild as C47 } from './shots/interaction/canvas-materialize-moves/DiagramCascadeBuild'
import M47 from './shots/interaction/canvas-materialize-moves/DiagramCascadeBuild.meta.json'
import { PanelToCanvasMaterialize as C48 } from './shots/interaction/canvas-materialize-moves/PanelToCanvasMaterialize'
import M48 from './shots/interaction/canvas-materialize-moves/PanelToCanvasMaterialize.meta.json'
import { ChipGridSingleSelectBlackout as C49 } from './shots/interaction/chip-grid-single-select-blackout/ChipGridSingleSelectBlackout'
import M49 from './shots/interaction/chip-grid-single-select-blackout/ChipGridSingleSelectBlackout.meta.json'
import { CursorCastEnsemble as C50 } from './shots/interaction/collab-cursor-moves/CursorCastEnsemble'
import M50 from './shots/interaction/collab-cursor-moves/CursorCastEnsemble.meta.json'
import { GlassPillDictationTyping as C51 } from './shots/interaction/glass-pill-dictation-typing/GlassPillDictationTyping'
import M51 from './shots/interaction/glass-pill-dictation-typing/GlassPillDictationTyping.meta.json'
import { HashtagToPillMaterialize as C52 } from './shots/interaction/hashtag-to-pill-materialize/HashtagToPillMaterialize'
import M52 from './shots/interaction/hashtag-to-pill-materialize/HashtagToPillMaterialize.meta.json'
import { PickerCarouselFeatureCycle as C53 } from './shots/interaction/picker-carousel-feature-cycle/PickerCarouselFeatureCycle'
import M53 from './shots/interaction/picker-carousel-feature-cycle/PickerCarouselFeatureCycle.meta.json'
import { SegmentedThumbHero as C54 } from './shots/interaction/segmented-thumb-hero/SegmentedThumbHero'
import M54 from './shots/interaction/segmented-thumb-hero/SegmentedThumbHero.meta.json'
import { PaletteThemeRipple as C55 } from './shots/interaction/theme-switch-moves/PaletteThemeRipple'
import M55 from './shots/interaction/theme-switch-moves/PaletteThemeRipple.meta.json'
import { ThemeSweepToggle as C56 } from './shots/interaction/theme-switch-moves/ThemeSweepToggle'
import M56 from './shots/interaction/theme-switch-moves/ThemeSweepToggle.meta.json'
import { TypeAndFilter as C57 } from './shots/interaction/type-and-filter/TypeAndFilter'
import M57 from './shots/interaction/type-and-filter/TypeAndFilter.meta.json'
import { VoiceWaveformLive as C58 } from './shots/interaction/voice-waveform-live/VoiceWaveformLive'
import M58 from './shots/interaction/voice-waveform-live/VoiceWaveformLive.meta.json'
import { CraneRiseReveal as C59 } from './shots/opening/crane-rise-reveal/CraneRiseReveal'
import M59 from './shots/opening/crane-rise-reveal/CraneRiseReveal.meta.json'
import { DatavizLandscapeOpen as C60 } from './shots/opening/dataviz-landscape-open/DatavizLandscapeOpen'
import M60 from './shots/opening/dataviz-landscape-open/DatavizLandscapeOpen.meta.json'
import { Fracture as C61 } from './shots/opening/fracture/Fracture'
import M61 from './shots/opening/fracture/Fracture.meta.json'
import { IconFieldColorize as C62 } from './shots/opening/icon-field-colorize/IconFieldColorize'
import M62 from './shots/opening/icon-field-colorize/IconFieldColorize.meta.json'
import { LetterspaceMaterialize as C63 } from './shots/opening/letterspace-materialize/LetterspaceMaterialize'
import M63 from './shots/opening/letterspace-materialize/LetterspaceMaterialize.meta.json'
import { MagicianCardFlourish as C64 } from './shots/opening/magician-card-flourish/MagicianCardFlourish'
import M64 from './shots/opening/magician-card-flourish/MagicianCardFlourish.meta.json'
import { OrbitRingTitleOpen as C65 } from './shots/opening/orbit-ring-title-open/OrbitRingTitleOpen'
import M65 from './shots/opening/orbit-ring-title-open/OrbitRingTitleOpen.meta.json'
import { SpotlightHeroCard as C66 } from './shots/opening/spotlight-hero-card/SpotlightHeroCard'
import M66 from './shots/opening/spotlight-hero-card/SpotlightHeroCard.meta.json'
import { StrokeSegmentBuild as C67 } from './shots/opening/stroke-segment-build/StrokeSegmentBuild'
import M67 from './shots/opening/stroke-segment-build/StrokeSegmentBuild.meta.json'
import { TextAsMask as C68 } from './shots/opening/text-as-mask/TextAsMask'
import M68 from './shots/opening/text-as-mask/TextAsMask.meta.json'
import { GrainDissolve as C69 } from './shots/outro/grain-dissolve/GrainDissolve'
import M69 from './shots/outro/grain-dissolve/GrainDissolve.meta.json'
import { LogoShrinkWordmarkLockup as C70 } from './shots/outro/logo-shrink-wordmark-lockup/LogoShrinkWordmarkLockup'
import M70 from './shots/outro/logo-shrink-wordmark-lockup/LogoShrinkWordmarkLockup.meta.json'
import { NeonTripleMarquee as C71 } from './shots/outro/neon-triple-marquee/NeonTripleMarquee'
import M71 from './shots/outro/neon-triple-marquee/NeonTripleMarquee.meta.json'
import { OutroGroupPhotoLaunch as C72 } from './shots/outro/outro-group-photo-launch/OutroGroupPhotoLaunch'
import M72 from './shots/outro/outro-group-photo-launch/OutroGroupPhotoLaunch.meta.json'
import { UiStripAwayOutro as C73 } from './shots/outro/ui-strip-away-outro/UiStripAwayOutro'
import M73 from './shots/outro/ui-strip-away-outro/UiStripAwayOutro.meta.json'
import { IconFlipBloomLogo as C74 } from './shots/outro/ui-to-brand-morph/IconFlipBloomLogo'
import M74 from './shots/outro/ui-to-brand-morph/IconFlipBloomLogo.meta.json'
import { InputMorphsIntoLogo as C75 } from './shots/outro/ui-to-brand-morph/InputMorphsIntoLogo'
import M75 from './shots/outro/ui-to-brand-morph/InputMorphsIntoLogo.meta.json'
import { PaparazziFlash as C76 } from './shots/rhythm/beat-cut-moves/PaparazziFlash'
import M76 from './shots/rhythm/beat-cut-moves/PaparazziFlash.meta.json'
import { BeatStepListThemeCycle as C77 } from './shots/rhythm/beat-step-list-theme-cycle/BeatStepListThemeCycle'
import M77 from './shots/rhythm/beat-step-list-theme-cycle/BeatStepListThemeCycle.meta.json'
import { ComicPanelSplit as C78 } from './shots/rhythm/panel-grid-moves/ComicPanelSplit'
import M78 from './shots/rhythm/panel-grid-moves/ComicPanelSplit.meta.json'
import { QuadSplitParallelScenes as C79 } from './shots/rhythm/quad-split-parallel-scenes/QuadSplitParallelScenes'
import M79 from './shots/rhythm/quad-split-parallel-scenes/QuadSplitParallelScenes.meta.json'
import { JumpCutPunchIn as C80 } from './shots/rhythm/rhythm-interrupt-moves/JumpCutPunchIn'
import M80 from './shots/rhythm/rhythm-interrupt-moves/JumpCutPunchIn.meta.json'
import { SakugaTimingShift as C81 } from './shots/rhythm/sakuga-timing-shift/SakugaTimingShift'
import M81 from './shots/rhythm/sakuga-timing-shift/SakugaTimingShift.meta.json'
import { FreezeAnnotateReal as C82 } from './shots/rhythm/speed-ramp-freeze/FreezeAnnotateReal'
import M82 from './shots/rhythm/speed-ramp-freeze/FreezeAnnotateReal.meta.json'
import { TrailerBumper as C83 } from './shots/rhythm/trailer-grammar-moves/TrailerBumper'
import M83 from './shots/rhythm/trailer-grammar-moves/TrailerBumper.meta.json'
import { BottomPushStackWipe as C84 } from './shots/transition/bottom-push-stack-wipe/BottomPushStackWipe'
import M84 from './shots/transition/bottom-push-stack-wipe/BottomPushStackWipe.meta.json'
import { CardFlipReveal as C85 } from './shots/transition/card-flip-reveal/CardFlipReveal'
import M85 from './shots/transition/card-flip-reveal/CardFlipReveal.meta.json'
import { CardFlockTumble as C86 } from './shots/transition/card-flock-tumble/CardFlockTumble'
import M86 from './shots/transition/card-flock-tumble/CardFlockTumble.meta.json'
import { CircleMatchIris as C87 } from './shots/transition/circle-match-iris/CircleMatchIris'
import M87 from './shots/transition/circle-match-iris/CircleMatchIris.meta.json'
import { GradientTransition as C88 } from './shots/transition/gradient-transition/GradientTransition'
import M88 from './shots/transition/gradient-transition/GradientTransition.meta.json'
import { LineCarryTransition as C89 } from './shots/transition/line-carry-transition/LineCarryTransition'
import M89 from './shots/transition/line-carry-transition/LineCarryTransition.meta.json'
import { MosaicReframe as C90 } from './shots/transition/mosaic-reframe/MosaicReframe'
import M90 from './shots/transition/mosaic-reframe/MosaicReframe.meta.json'
import { BarnDoorSplit as C91 } from './shots/transition/page-turn-transitions/BarnDoorSplit'
import M91 from './shots/transition/page-turn-transitions/BarnDoorSplit.meta.json'
import { InkBleedReveal as C92 } from './shots/transition/print-texture-transitions/InkBleedReveal'
import M92 from './shots/transition/print-texture-transitions/InkBleedReveal.meta.json'
import { FlashCut as C93 } from './shots/transition/shot-transitions/FlashCut'
import M93 from './shots/transition/shot-transitions/FlashCut.meta.json'
import { PortalWipeV2 as C94 } from './shots/transition/shot-transitions/PortalWipeV2'
import M94 from './shots/transition/shot-transitions/PortalWipeV2.meta.json'
import { WhipBrakeReal as C95 } from './shots/transition/shot-transitions/WhipBrakeReal'
import M95 from './shots/transition/shot-transitions/WhipBrakeReal.meta.json'
import { GlitchDisplace as C96 } from './shots/transition/tear-streak-transitions/GlitchDisplace'
import M96 from './shots/transition/tear-streak-transitions/GlitchDisplace.meta.json'
import { InvisibleCut as C97 } from './shots/transition/transition-hidden-cut/InvisibleCut'
import M97 from './shots/transition/transition-hidden-cut/InvisibleCut.meta.json'
import { LightLeakBurn as C98 } from './shots/transition/transition-hidden-cut/LightLeakBurn'
import M98 from './shots/transition/transition-hidden-cut/LightLeakBurn.meta.json'
import { VersusSlam as C99 } from './shots/transition/transition-hidden-cut/VersusSlam'
import M99 from './shots/transition/transition-hidden-cut/VersusSlam.meta.json'
import { LetterformZoom as C100 } from './shots/transition/transition-travel/LetterformZoom'
import M100 from './shots/transition/transition-travel/LetterformZoom.meta.json'
import { WhiteFlashLogoSimplifyCut as C101 } from './shots/transition/white-flash-logo-simplify-cut/WhiteFlashLogoSimplifyCut'
import M101 from './shots/transition/white-flash-logo-simplify-cut/WhiteFlashLogoSimplifyCut.meta.json'
import { BlindsSlice as C102 } from './shots/transition/wipe-transitions/BlindsSlice'
import M102 from './shots/transition/wipe-transitions/BlindsSlice.meta.json'
import { BlurSlide as C103 } from './shots/typography/blur-slide/BlurSlide'
import M103 from './shots/typography/blur-slide/BlurSlide.meta.json'
import { BraceExpand as C104 } from './shots/typography/brace-expand/BraceExpand'
import M104 from './shots/typography/brace-expand/BraceExpand.meta.json'
import { BrandInkOpen as C105 } from './shots/typography/brand-ink-open/BrandInkOpen'
import M105 from './shots/typography/brand-ink-open/BrandInkOpen.meta.json'
import { CountdownArcScatter as C106 } from './shots/typography/countdown-arc-scatter/CountdownArcScatter'
import M106 from './shots/typography/countdown-arc-scatter/CountdownArcScatter.meta.json'
import { FlyingWords as C107 } from './shots/typography/flying-words/FlyingWords'
import M107 from './shots/typography/flying-words/FlyingWords.meta.json'
import { GlitchCycle as C108 } from './shots/typography/glitch-cycle/GlitchCycle'
import M108 from './shots/typography/glitch-cycle/GlitchCycle.meta.json'
import { GradientWordSweep as C109 } from './shots/typography/gradient-word-sweep/GradientWordSweep'
import M109 from './shots/typography/gradient-word-sweep/GradientWordSweep.meta.json'
import { LeadWordZoomAssemble as C110 } from './shots/typography/lead-word-zoom-assemble/LeadWordZoomAssemble'
import M110 from './shots/typography/lead-word-zoom-assemble/LeadWordZoomAssemble.meta.json'
import { MarkerUnderlineTitle as C111 } from './shots/typography/marker-underline-title/MarkerUnderlineTitle'
import M111 from './shots/typography/marker-underline-title/MarkerUnderlineTitle.meta.json'
import { OutlineWordFill as C112 } from './shots/typography/outline-word-fill/OutlineWordFill'
import M112 from './shots/typography/outline-word-fill/OutlineWordFill.meta.json'
import { PaperTitleCard as C113 } from './shots/typography/paper-title-card/PaperTitleCard'
import M113 from './shots/typography/paper-title-card/PaperTitleCard.meta.json'
import { PillChipSlotCycleHandled as C114 } from './shots/typography/pill-chip-slot-cycle-handled/PillChipSlotCycleHandled'
import M114 from './shots/typography/pill-chip-slot-cycle-handled/PillChipSlotCycleHandled.meta.json'
import { PillSlotCycle as C115 } from './shots/typography/pill-slot-cycle/PillSlotCycle'
import M115 from './shots/typography/pill-slot-cycle/PillSlotCycle.meta.json'
import { TextColumnConverge as C116 } from './shots/typography/text-column-converge/TextColumnConverge'
import M116 from './shots/typography/text-column-converge/TextColumnConverge.meta.json'
import { TitleDemoteToLabel as C117 } from './shots/typography/title-demote-to-label/TitleDemoteToLabel'
import M117 from './shots/typography/title-demote-to-label/TitleDemoteToLabel.meta.json'
import { LetterformDriftAssembly as C118 } from './shots/typography/type-assembly-moves/LetterformDriftAssembly'
import M118 from './shots/typography/type-assembly-moves/LetterformDriftAssembly.meta.json'
import { SplitTextStagger as C119 } from './shots/typography/type-assembly-moves/SplitTextStagger'
import M119 from './shots/typography/type-assembly-moves/SplitTextStagger.meta.json'
import { TextOnPath as C120 } from './shots/typography/type-assembly-moves/TextOnPath'
import M120 from './shots/typography/type-assembly-moves/TextOnPath.meta.json'
import { LetterDropPhysics as C121 } from './shots/typography/type-entrance-moves/LetterDropPhysics'
import M121 from './shots/typography/type-entrance-moves/LetterDropPhysics.meta.json'
import { FontWeightPump as C122 } from './shots/typography/type-rhythm-sync/FontWeightPump'
import M122 from './shots/typography/type-rhythm-sync/FontWeightPump.meta.json'
import { KaraokeFillSync as C123 } from './shots/typography/type-rhythm-sync/KaraokeFillSync'
import M123 from './shots/typography/type-rhythm-sync/KaraokeFillSync.meta.json'
import { TypewriterErrorRetype as C124 } from './shots/typography/typewriter-moves/TypewriterErrorRetype'
import M124 from './shots/typography/typewriter-moves/TypewriterErrorRetype.meta.json'
import { VerticalWordRollBlurCycle as C125 } from './shots/typography/vertical-word-roll-blur-cycle/VerticalWordRollBlurCycle'
import M125 from './shots/typography/vertical-word-roll-blur-cycle/VerticalWordRollBlurCycle.meta.json'
import { WordRelayFilmstrip as C126 } from './shots/typography/word-relay-filmstrip/WordRelayFilmstrip'
import M126 from './shots/typography/word-relay-filmstrip/WordRelayFilmstrip.meta.json'
import { WordRelayGeometry as C127 } from './shots/typography/word-relay-geometry/WordRelayGeometry'
import M127 from './shots/typography/word-relay-geometry/WordRelayGeometry.meta.json'
import { AvatarBracketCarousel as C128 } from './shots/ui-entrance/avatar-bracket-carousel/AvatarBracketCarousel'
import M128 from './shots/ui-entrance/avatar-bracket-carousel/AvatarBracketCarousel.meta.json'
import { BezierSourceConvergeMerge as C129 } from './shots/ui-entrance/bezier-source-converge-merge/BezierSourceConvergeMerge'
import M129 from './shots/ui-entrance/bezier-source-converge-merge/BezierSourceConvergeMerge.meta.json'
import { CardStack as C130 } from './shots/ui-entrance/card-stack/CardStack'
import M130 from './shots/ui-entrance/card-stack/CardStack.meta.json'
import { Carousel3D as C131 } from './shots/ui-entrance/carousel-3d/Carousel3D'
import M131 from './shots/ui-entrance/carousel-3d/Carousel3D.meta.json'
import { ClipCardLooping as C132 } from './shots/ui-entrance/clipcard-looping/ClipCardLooping'
import M132 from './shots/ui-entrance/clipcard-looping/ClipCardLooping.meta.json'
import { ClonerDepthEcho as C133 } from './shots/ui-entrance/cloner-depth-echo/ClonerDepthEcho'
import M133 from './shots/ui-entrance/cloner-depth-echo/ClonerDepthEcho.meta.json'
import { DeckDealFlyin as C134 } from './shots/ui-entrance/deck-deal-flyin/DeckDealFlyin'
import M134 from './shots/ui-entrance/deck-deal-flyin/DeckDealFlyin.meta.json'
import { DocParkLeftPillDeal as C135 } from './shots/ui-entrance/doc-park-left-pill-deal/DocParkLeftPillDeal'
import M135 from './shots/ui-entrance/doc-park-left-pill-deal/DocParkLeftPillDeal.meta.json'
import { DocumentTypewriterReveal as C136 } from './shots/ui-entrance/document-typewriter-reveal/DocumentTypewriterReveal'
import M136 from './shots/ui-entrance/document-typewriter-reveal/DocumentTypewriterReveal.meta.json'
import { DrawSvgTrace as C137 } from './shots/ui-entrance/draw-svg-trace/DrawSvgTrace'
import M137 from './shots/ui-entrance/draw-svg-trace/DrawSvgTrace.meta.json'
import { ContactShadowLift as C138 } from './shots/ui-entrance/element-body-moves/ContactShadowLift'
import M138 from './shots/ui-entrance/element-body-moves/ContactShadowLift.meta.json'
import { IntegrationHubMap as C139 } from './shots/ui-entrance/integration-hub-map/IntegrationHubMap'
import M139 from './shots/ui-entrance/integration-hub-map/IntegrationHubMap.meta.json'
import { ListReveal as C140 } from './shots/ui-entrance/list-reveal/ListReveal'
import M140 from './shots/ui-entrance/list-reveal/ListReveal.meta.json'
import { ListStackPress as C141 } from './shots/ui-entrance/list-stack-press/ListStackPress'
import M141 from './shots/ui-entrance/list-stack-press/ListStackPress.meta.json'
import { NeonFrameForerun as C142 } from './shots/ui-entrance/neon-frame-forerun/NeonFrameForerun'
import M142 from './shots/ui-entrance/neon-frame-forerun/NeonFrameForerun.meta.json'
import { NeonFrameForerunOrbit as C143 } from './shots/ui-entrance/neon-frame-orbit-drop/NeonFrameForerunOrbit'
import M143 from './shots/ui-entrance/neon-frame-orbit-drop/NeonFrameForerunOrbit.meta.json'
import { PageWaterfallWall as C144 } from './shots/ui-entrance/page-waterfall-wall/PageWaterfallWall'
import M144 from './shots/ui-entrance/page-waterfall-wall/PageWaterfallWall.meta.json'
import { ProductCardProgressiveAssemble as C145 } from './shots/ui-entrance/product-card-progressive-assemble/ProductCardProgressiveAssemble'
import M145 from './shots/ui-entrance/product-card-progressive-assemble/ProductCardProgressiveAssemble.meta.json'
import { RadialWave as C146 } from './shots/ui-entrance/radial-wave/RadialWave'
import M146 from './shots/ui-entrance/radial-wave/RadialWave.meta.json'
import { ResearchCardStackScroll as C147 } from './shots/ui-entrance/research-card-stack-scroll/ResearchCardStackScroll'
import M147 from './shots/ui-entrance/research-card-stack-scroll/ResearchCardStackScroll.meta.json'
import { RowEmbed as C148 } from './shots/ui-entrance/row-embed/RowEmbed'
import M148 from './shots/ui-entrance/row-embed/RowEmbed.meta.json'
import { ValueStaggerGradient as C149 } from './shots/ui-entrance/value-stagger-gradient/ValueStaggerGradient'
import M149 from './shots/ui-entrance/value-stagger-gradient/ValueStaggerGradient.meta.json'
import { BentoLightUp as C150 } from './shots/ui-entrance/wall-reveal-moves/BentoLightUp'
import M150 from './shots/ui-entrance/wall-reveal-moves/BentoLightUp.meta.json'
import { WireframeDrawOn as C151 } from './shots/ui-entrance/wall-reveal-moves/WireframeDrawOn'
import M151 from './shots/ui-entrance/wall-reveal-moves/WireframeDrawOn.meta.json'

export const SHOTS: Record<string, { C: React.FC; meta: ShotMeta }> = {
  "basic-3d-scene": { C: C0 as React.FC, meta: M0 as unknown as ShotMeta },
  "crash-impact": { C: C1 as React.FC, meta: M1 as unknown as ShotMeta },
  "crash-zoom-punch": { C: C2 as React.FC, meta: M2 as unknown as ShotMeta },
  "cursor-flyover": { C: C3 as React.FC, meta: M3 as unknown as ShotMeta },
  "multiplane": { C: C4 as React.FC, meta: M4 as unknown as ShotMeta },
  "graze-face-tour": { C: C5 as React.FC, meta: M5 as unknown as ShotMeta },
  "overhead-tabletop-drop": { C: C6 as React.FC, meta: M6 as unknown as ShotMeta },
  "tilt-reveal": { C: C7 as React.FC, meta: M7 as unknown as ShotMeta },
  "drone-dive-landing": { C: C8 as React.FC, meta: M8 as unknown as ShotMeta },
  "exploded-view": { C: C9 as React.FC, meta: M9 as unknown as ShotMeta },
  "steep-tilt-glide": { C: C10 as React.FC, meta: M10 as unknown as ShotMeta },
  "bullet-time-freeze-orbit": { C: C11 as React.FC, meta: M11 as unknown as ShotMeta },
  "pull-back-isolation": { C: C12 as React.FC, meta: M12 as unknown as ShotMeta },
  "terminal-3d": { C: C13 as React.FC, meta: M13 as unknown as ShotMeta },
  "before-after-slider-scrub": { C: C14 as React.FC, meta: M14 as unknown as ShotMeta },
  "axis-rescale-shock": { C: C15 as React.FC, meta: M15 as unknown as ShotMeta },
  "oscilloscope-stream": { C: C16 as React.FC, meta: M16 as unknown as ShotMeta },
  "unit-dot-swarm-regroup": { C: C17 as React.FC, meta: M17 as unknown as ShotMeta },
  "needle-sweep-selftest": { C: C18 as React.FC, meta: M18 as unknown as ShotMeta },
  "tape-scroll-fixed-pointer": { C: C19 as React.FC, meta: M19 as unknown as ShotMeta },
  "brake-reticle-lock": { C: C20 as React.FC, meta: M20 as unknown as ShotMeta },
  "changelog-scroll-brake": { C: C21 as React.FC, meta: M21 as unknown as ShotMeta },
  "timeline-travel": { C: C22 as React.FC, meta: M22 as unknown as ShotMeta },
  "assemble-then-type-flyin": { C: C23 as React.FC, meta: M23 as unknown as ShotMeta },
  "aurora-bloom-bg-flip": { C: C24 as React.FC, meta: M24 as unknown as ShotMeta },
  "brand-frame-snap": { C: C25 as React.FC, meta: M25 as unknown as ShotMeta },
  "reticle-lock-on": { C: C26 as React.FC, meta: M26 as unknown as ShotMeta },
  "flyline-arc": { C: C27 as React.FC, meta: M27 as unknown as ShotMeta },
  "glow-orb-ambient": { C: C28 as React.FC, meta: M28 as unknown as ShotMeta },
  "orb-flyline-relay": { C: C29 as React.FC, meta: M29 as unknown as ShotMeta },
  "attention-bounce": { C: C30 as React.FC, meta: M30 as unknown as ShotMeta },
  "anime-impact": { C: C31 as React.FC, meta: M31 as unknown as ShotMeta },
  "hit-counter": { C: C32 as React.FC, meta: M32 as unknown as ShotMeta },
  "sheen-sweep": { C: C33 as React.FC, meta: M33 as unknown as ShotMeta },
  "spotlight-sweep": { C: C34 as React.FC, meta: M34 as unknown as ShotMeta },
  "radial-ripple-phone-chips": { C: C35 as React.FC, meta: M35 as unknown as ShotMeta },
  "misregistration-hit": { C: C36 as React.FC, meta: M36 as unknown as ShotMeta },
  "scan-bracket-sweep": { C: C37 as React.FC, meta: M37 as unknown as ShotMeta },
  "scanline-annotate-focus": { C: C38 as React.FC, meta: M38 as unknown as ShotMeta },
  "scanline-assemble-flyin": { C: C39 as React.FC, meta: M39 as unknown as ShotMeta },
  "impact-burst-kit": { C: C40 as React.FC, meta: M40 as unknown as ShotMeta },
  "kanada-perspective-snap": { C: C41 as React.FC, meta: M41 as unknown as ShotMeta },
  "score-slam": { C: C42 as React.FC, meta: M42 as unknown as ShotMeta },
  "corner-spotlight-reveal": { C: C43 as React.FC, meta: M43 as unknown as ShotMeta },
  "glow-wake-sleep-panel": { C: C44 as React.FC, meta: M44 as unknown as ShotMeta },
  "slide-spotlight-pan": { C: C45 as React.FC, meta: M45 as unknown as ShotMeta },
  "autolayout-gap-dial": { C: C46 as React.FC, meta: M46 as unknown as ShotMeta },
  "diagram-cascade": { C: C47 as React.FC, meta: M47 as unknown as ShotMeta },
  "panel-to-canvas": { C: C48 as React.FC, meta: M48 as unknown as ShotMeta },
  "chip-grid-single-select-blackout": { C: C49 as React.FC, meta: M49 as unknown as ShotMeta },
  "cast-ensemble": { C: C50 as React.FC, meta: M50 as unknown as ShotMeta },
  "glass-pill-dictation-typing": { C: C51 as React.FC, meta: M51 as unknown as ShotMeta },
  "hashtag-to-pill-materialize": { C: C52 as React.FC, meta: M52 as unknown as ShotMeta },
  "picker-carousel-feature-cycle": { C: C53 as React.FC, meta: M53 as unknown as ShotMeta },
  "segmented-thumb-hero": { C: C54 as React.FC, meta: M54 as unknown as ShotMeta },
  "palette-theme-ripple": { C: C55 as React.FC, meta: M55 as unknown as ShotMeta },
  "theme-sweep-toggle": { C: C56 as React.FC, meta: M56 as unknown as ShotMeta },
  "type-and-filter": { C: C57 as React.FC, meta: M57 as unknown as ShotMeta },
  "voice-waveform-live": { C: C58 as React.FC, meta: M58 as unknown as ShotMeta },
  "crane-rise-reveal": { C: C59 as React.FC, meta: M59 as unknown as ShotMeta },
  "dataviz-landscape-open": { C: C60 as React.FC, meta: M60 as unknown as ShotMeta },
  "fracture": { C: C61 as React.FC, meta: M61 as unknown as ShotMeta },
  "icon-field-colorize": { C: C62 as React.FC, meta: M62 as unknown as ShotMeta },
  "letterspace-materialize": { C: C63 as React.FC, meta: M63 as unknown as ShotMeta },
  "magician-card-flourish": { C: C64 as React.FC, meta: M64 as unknown as ShotMeta },
  "orbit-ring-title-open": { C: C65 as React.FC, meta: M65 as unknown as ShotMeta },
  "spotlight-hero-card": { C: C66 as React.FC, meta: M66 as unknown as ShotMeta },
  "stroke-segment-build": { C: C67 as React.FC, meta: M67 as unknown as ShotMeta },
  "text-as-mask": { C: C68 as React.FC, meta: M68 as unknown as ShotMeta },
  "grain-dissolve": { C: C69 as React.FC, meta: M69 as unknown as ShotMeta },
  "logo-shrink-wordmark-lockup": { C: C70 as React.FC, meta: M70 as unknown as ShotMeta },
  "neon-triple-marquee": { C: C71 as React.FC, meta: M71 as unknown as ShotMeta },
  "outro-group-photo-launch": { C: C72 as React.FC, meta: M72 as unknown as ShotMeta },
  "ui-strip-away-outro": { C: C73 as React.FC, meta: M73 as unknown as ShotMeta },
  "icon-flip-bloom": { C: C74 as React.FC, meta: M74 as unknown as ShotMeta },
  "input-morph-assemble": { C: C75 as React.FC, meta: M75 as unknown as ShotMeta },
  "paparazzi-flash": { C: C76 as React.FC, meta: M76 as unknown as ShotMeta },
  "beat-step-list-theme-cycle": { C: C77 as React.FC, meta: M77 as unknown as ShotMeta },
  "comic-panel-split": { C: C78 as React.FC, meta: M78 as unknown as ShotMeta },
  "quad-split-parallel-scenes": { C: C79 as React.FC, meta: M79 as unknown as ShotMeta },
  "jump-cut-punch-in": { C: C80 as React.FC, meta: M80 as unknown as ShotMeta },
  "sakuga-timing-shift": { C: C81 as React.FC, meta: M81 as unknown as ShotMeta },
  "freeze-annotate": { C: C82 as React.FC, meta: M82 as unknown as ShotMeta },
  "trailer-bumper": { C: C83 as React.FC, meta: M83 as unknown as ShotMeta },
  "bottom-push-stack-wipe": { C: C84 as React.FC, meta: M84 as unknown as ShotMeta },
  "card-flip-reveal": { C: C85 as React.FC, meta: M85 as unknown as ShotMeta },
  "card-flock-tumble": { C: C86 as React.FC, meta: M86 as unknown as ShotMeta },
  "circle-match-iris": { C: C87 as React.FC, meta: M87 as unknown as ShotMeta },
  "gradient-transition": { C: C88 as React.FC, meta: M88 as unknown as ShotMeta },
  "line-carry-transition": { C: C89 as React.FC, meta: M89 as unknown as ShotMeta },
  "mosaic-reframe": { C: C90 as React.FC, meta: M90 as unknown as ShotMeta },
  "barn-door-split": { C: C91 as React.FC, meta: M91 as unknown as ShotMeta },
  "ink-bleed-reveal": { C: C92 as React.FC, meta: M92 as unknown as ShotMeta },
  "flash-cut": { C: C93 as React.FC, meta: M93 as unknown as ShotMeta },
  "mask-wipe": { C: C94 as React.FC, meta: M94 as unknown as ShotMeta },
  "whip-pan": { C: C95 as React.FC, meta: M95 as unknown as ShotMeta },
  "glitch-displace": { C: C96 as React.FC, meta: M96 as unknown as ShotMeta },
  "invisible-cut": { C: C97 as React.FC, meta: M97 as unknown as ShotMeta },
  "light-leak-burn": { C: C98 as React.FC, meta: M98 as unknown as ShotMeta },
  "versus-slam": { C: C99 as React.FC, meta: M99 as unknown as ShotMeta },
  "letterform-zoom": { C: C100 as React.FC, meta: M100 as unknown as ShotMeta },
  "white-flash-logo-simplify-cut": { C: C101 as React.FC, meta: M101 as unknown as ShotMeta },
  "blinds-slice": { C: C102 as React.FC, meta: M102 as unknown as ShotMeta },
  "blur-slide": { C: C103 as React.FC, meta: M103 as unknown as ShotMeta },
  "brace-expand": { C: C104 as React.FC, meta: M104 as unknown as ShotMeta },
  "brand-ink-open": { C: C105 as React.FC, meta: M105 as unknown as ShotMeta },
  "countdown-arc-scatter": { C: C106 as React.FC, meta: M106 as unknown as ShotMeta },
  "flying-words": { C: C107 as React.FC, meta: M107 as unknown as ShotMeta },
  "glitch-cycle": { C: C108 as React.FC, meta: M108 as unknown as ShotMeta },
  "gradient-word-sweep": { C: C109 as React.FC, meta: M109 as unknown as ShotMeta },
  "lead-word-zoom-assemble": { C: C110 as React.FC, meta: M110 as unknown as ShotMeta },
  "marker-underline-title": { C: C111 as React.FC, meta: M111 as unknown as ShotMeta },
  "outline-word-fill": { C: C112 as React.FC, meta: M112 as unknown as ShotMeta },
  "paper-title-card": { C: C113 as React.FC, meta: M113 as unknown as ShotMeta },
  "pill-chip-slot-cycle-handled": { C: C114 as React.FC, meta: M114 as unknown as ShotMeta },
  "pill-slot-cycle": { C: C115 as React.FC, meta: M115 as unknown as ShotMeta },
  "text-column-converge": { C: C116 as React.FC, meta: M116 as unknown as ShotMeta },
  "title-demote-to-label": { C: C117 as React.FC, meta: M117 as unknown as ShotMeta },
  "drift-assembly": { C: C118 as React.FC, meta: M118 as unknown as ShotMeta },
  "split-text-stagger": { C: C119 as React.FC, meta: M119 as unknown as ShotMeta },
  "text-on-path": { C: C120 as React.FC, meta: M120 as unknown as ShotMeta },
  "letter-drop-physics": { C: C121 as React.FC, meta: M121 as unknown as ShotMeta },
  "font-weight-pump": { C: C122 as React.FC, meta: M122 as unknown as ShotMeta },
  "karaoke-fill-sync": { C: C123 as React.FC, meta: M123 as unknown as ShotMeta },
  "error-retype": { C: C124 as React.FC, meta: M124 as unknown as ShotMeta },
  "vertical-word-roll-blur-cycle": { C: C125 as React.FC, meta: M125 as unknown as ShotMeta },
  "word-relay-filmstrip": { C: C126 as React.FC, meta: M126 as unknown as ShotMeta },
  "word-relay-geometry": { C: C127 as React.FC, meta: M127 as unknown as ShotMeta },
  "avatar-bracket-carousel": { C: C128 as React.FC, meta: M128 as unknown as ShotMeta },
  "bezier-source-converge-merge": { C: C129 as React.FC, meta: M129 as unknown as ShotMeta },
  "card-stack": { C: C130 as React.FC, meta: M130 as unknown as ShotMeta },
  "carousel-3d": { C: C131 as React.FC, meta: M131 as unknown as ShotMeta },
  "clipcard-looping": { C: C132 as React.FC, meta: M132 as unknown as ShotMeta },
  "cloner-depth-echo": { C: C133 as React.FC, meta: M133 as unknown as ShotMeta },
  "deck-deal-flyin": { C: C134 as React.FC, meta: M134 as unknown as ShotMeta },
  "doc-park-left-pill-deal": { C: C135 as React.FC, meta: M135 as unknown as ShotMeta },
  "document-typewriter-reveal": { C: C136 as React.FC, meta: M136 as unknown as ShotMeta },
  "draw-svg-trace": { C: C137 as React.FC, meta: M137 as unknown as ShotMeta },
  "contact-shadow-lift": { C: C138 as React.FC, meta: M138 as unknown as ShotMeta },
  "integration-hub-map": { C: C139 as React.FC, meta: M139 as unknown as ShotMeta },
  "list-reveal": { C: C140 as React.FC, meta: M140 as unknown as ShotMeta },
  "list-stack-press": { C: C141 as React.FC, meta: M141 as unknown as ShotMeta },
  "neon-frame-forerun": { C: C142 as React.FC, meta: M142 as unknown as ShotMeta },
  "neon-frame-orbit-drop": { C: C143 as React.FC, meta: M143 as unknown as ShotMeta },
  "page-waterfall-wall": { C: C144 as React.FC, meta: M144 as unknown as ShotMeta },
  "product-card-progressive-assemble": { C: C145 as React.FC, meta: M145 as unknown as ShotMeta },
  "radial-wave": { C: C146 as React.FC, meta: M146 as unknown as ShotMeta },
  "research-card-stack-scroll": { C: C147 as React.FC, meta: M147 as unknown as ShotMeta },
  "row-embed": { C: C148 as React.FC, meta: M148 as unknown as ShotMeta },
  "value-stagger-gradient": { C: C149 as React.FC, meta: M149 as unknown as ShotMeta },
  "bento-light-up": { C: C150 as React.FC, meta: M150 as unknown as ShotMeta },
  "wireframe-draw-on": { C: C151 as React.FC, meta: M151 as unknown as ShotMeta },
}
