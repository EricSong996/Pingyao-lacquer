/**
 * 车间 3D 简版参观（Three.js）
 * 左：制胎/刮灰/荫房  中：走廊  右：画工
 * WASD + 鼠标视角；走廊/荫房门洞通行
 */
(function (global) {
  const TEX = {
    wallLeft: "images/workshop-3d/frame-01.jpg",
    scrape: "images/workshop-3d/frame-03.jpg",
    paintTable: "images/workshop-3d/frame-06.jpg",
    paintClose: "images/workshop-3d/frame-08.jpg",
    corridor: "images/workshop-3d/frame-10.jpg",
    art: "images/workshop-3d/frame-12.jpg",
    konghou: "images/workshop-3d/konghou.jpg",
    woodLight: "images/workshop-3d/wood-light.jpg",
    clothRough: "images/workshop-3d/cloth-rough.jpg",
    tableTop: "images/workshop-3d/table-top.jpg",
  };

  class Workshop3D {
    constructor(container) {
      this.container = container;
      this.doors = [];
      this.labels = [];
      this.colliders = [];
      this.keys = Object.create(null);
      this.yaw = Math.PI;
      this.pitch = 0;
      this.speed = 4.2;
      this.eyeStand = 1.65;
      this.eyeCrouch = 1.05;
      this.eye = this.eyeStand;
      this.eyeCurrent = this.eyeStand;
      this.radius = 0.35;
      this.running = false;
      this.locked = false;
      this._raf = 0;
      this._last = 0;
      this._onKeyDown = (e) => this.onKey(e, true);
      this._onKeyUp = (e) => this.onKey(e, false);
      this._onMouse = (e) => this.onMouse(e);
      this._onClick = () => this.onClick();
      this._onLockChange = () => this.onLockChange();
      this._onResize = () => this.onResize();
    }

    async start() {
      if (!global.THREE) throw new Error("Three.js 未加载");
      if (this.running) {
        this.onResize();
        return;
      }
      this.running = true;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0xb8c0c6);
      this.scene.fog = new THREE.Fog(0xb8c0c6, 18, 42);

      this.camera = new THREE.PerspectiveCamera(70, 1, 0.08, 80);
      this.camera.position.set(0, this.eye, 5.5);

      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.container.appendChild(this.renderer.domElement);

      this.loader = new THREE.TextureLoader();
      const textures = await this.loadTextures();
      // 等草书字体就绪，柜门题字才不会退回楷体
      try {
        if (document.fonts?.load) {
          await document.fonts.load("108px 'Liu Jian Mao Cao'");
          await document.fonts.ready;
        }
      } catch (_) {
        /* 离线时用系统回退字体 */
      }
      this.buildWorld(textures);

      window.addEventListener("keydown", this._onKeyDown);
      window.addEventListener("keyup", this._onKeyUp);
      document.addEventListener("pointerlockchange", this._onLockChange);
      this.renderer.domElement.addEventListener("click", this._onClick);
      this.renderer.domElement.addEventListener("mousemove", this._onMouse);
      window.addEventListener("resize", this._onResize);
      this.onResize();

      this._last = performance.now();
      const loop = (now) => {
        if (!this.running) return;
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;
        this.update(dt);
        this.renderer.render(this.scene, this.camera);
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this._raf);
      if (document.pointerLockElement === this.renderer?.domElement) {
        document.exitPointerLock?.();
      }
      window.removeEventListener("keydown", this._onKeyDown);
      window.removeEventListener("keyup", this._onKeyUp);
      document.removeEventListener("pointerlockchange", this._onLockChange);
      window.removeEventListener("resize", this._onResize);
      if (this.renderer) {
        this.renderer.domElement.removeEventListener("click", this._onClick);
        this.renderer.domElement.removeEventListener("mousemove", this._onMouse);
        this.renderer.dispose();
        this.renderer.domElement.remove();
      }
      this.renderer = null;
      this.scene = null;
    }

    loadTextures() {
      const entries = Object.entries(TEX);
      return Promise.all(
        entries.map(
          ([key, url]) =>
            new Promise((resolve) => {
              this.loader.load(
                url,
                (tex) => {
                  tex.colorSpace = THREE.SRGBColorSpace;
                  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
                  resolve([key, tex]);
                },
                undefined,
                () => resolve([key, null])
              );
            })
        )
      ).then((pairs) => Object.fromEntries(pairs));
    }

    mat(color, map, opts = {}) {
      return new THREE.MeshStandardMaterial({
        color: map ? 0xffffff : color,
        map: map || null,
        roughness: opts.roughness ?? 0.85,
        metalness: opts.metalness ?? 0.05,
        transparent: !!opts.transparent,
        opacity: opts.opacity ?? 1,
        side: opts.side || THREE.FrontSide,
      });
    }

    box(w, h, d, material, x, y, z, collide = true) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      if (collide) {
        this.colliders.push({
          minX: x - w / 2,
          maxX: x + w / 2,
          minZ: z - d / 2,
          maxZ: z + d / 2,
        });
      }
      return mesh;
    }

    plane(w, h, material, x, y, z, rotY = 0) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
      mesh.position.set(x, y, z);
      mesh.rotation.y = rotY;
      this.scene.add(mesh);
      return mesh;
    }

    label(text, x, y, z) {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 128;
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = "rgba(20,14,10,0.55)";
      ctx.fillRect(20, 24, 472, 80);
      ctx.strokeStyle = "rgba(232,197,71,0.75)";
      ctx.lineWidth = 4;
      ctx.strokeRect(20, 24, 472, 80);
      ctx.fillStyle = "#f3e6cf";
      ctx.font = "bold 42px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 256, 64);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 0.6),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true })
      );
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      this.labels.push(mesh);
      return mesh;
    }

    buildWorld(tex) {
      const wall = 0xd5dde3;
      const accent = 0x8fa0ad;
      const wood = 0x3a2a22;
      const H = 3.2;

      // floor：灰色光滑水泥地；ceiling：常规白色
      this.box(30, 0.12, 18, this.makeConcreteFloorMat(), 0, -0.06, 0, false);
      this.box(30, 0.12, 18, this.mat(0xf7f7f7, null, { roughness: 0.92 }), 0, H + 0.06, 0, false);

      // lights：环境略提亮 + 天花长条 LED
      this.scene.add(new THREE.AmbientLight(0xffffff, 0.78));
      const hemi = new THREE.HemisphereLight(0xf0f4ff, 0xb8c0c6, 0.35);
      this.scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xfff2e0, 0.55);
      sun.position.set(4, 10, 2);
      this.scene.add(sun);
      const fill = new THREE.DirectionalLight(0xdde8ff, 0.28);
      fill.position.set(-6, 6, -4);
      this.scene.add(fill);

      // 外围墙：白边浅青蓝竖向长板拼接（中间大漆隔断另建）
      this.buildCyanPanelOuterWalls(H);
      // 天花与外围墙顶的白色收口梁 / 转角柱
      this.buildCeilingWallJunction(H);
      // 天花长条 LED 日光灯（均匀分布）
      this.buildCeilingLEDLights(H);

      // 走廊两侧：酒红色大漆隔墙 + 玻璃窗（门洞保留在 z≈0）
      this.buildLacquerCorridorWalls(H);

      // LEFT room furniture: 制胎 / 刮灰；荫房为独立木屋
      this.label("实木制胎", -9.4, 2.7, -5.0);
      this.label("裱布刮灰", -9.5, 2.7, 0.2);

      // 实木制胎：屏风 | 黑漆摞台 | 竖琴 | 佛像（均匀一字排开）
      this.addKonghouProps(tex);
      // 裱布刮灰：棕色长桌 + 三张方台（摊白布）+ 长桌旁小凳
      this.buildScrapeArea(tex, wood);
      // metal cabinet（避开荫房门口）
      this.box(1.2, 0.9, 0.7, this.mat(0xb7bdc2), -13.2, 0.45, 1.6);

      // 独立荫房
      this.buildYinRoom(tex);
      // 荫房东侧空位：多宝阁木架 + 漆器
      this.addDuobaogeShelf(tex);

      // CORRIDOR props
      this.label("走廊", 0, 2.75, -7.2);
      // 走廊尽头：青花瓷瓶 + 挺拔绿植（约天花 2/3 高）
      this.addCorridorEndPlant(H);
      // 左侧车间门外右侧：推光材料讲解长桌
      this.addPolishMaterialDemoTable(tex);

      // RIGHT painting room：清空旧桌，按图重构
      this.buildPaintWorkshop(tex);
      // 走廊门洞只留大漆门框（无门板）；荫房同理不装门
    }

    buildPaintWorkshop(tex) {
      // 画工车间：x=3.5~14.9（宽≈11.4），z=-8.9~8.9（长≈17.8）
      // 视角朝 -Z：左为大漆隔墙，右为外墙；右侧靠后角落放深色中式柜
      const x0 = 3.5;
      const x1 = 14.9;
      const z0 = -8.9;
      const z1 = 8.9;
      const roomW = x1 - x0;
      const roomL = z1 - z0;
      this.label("画工车间", (x0 + x1) / 2, 2.7, z0 + 2.2);

      // 朝走廊的柜面做门/抽屉；侧面进深 = 车间总宽 1/3；面宽 ≈ 总长 1/3
      const cabFaceW = roomL / 3; // 沿侧墙（Z）的正面宽度
      const cabSideD = roomW / 3; // 侧面宽度 = 进深（X）= 总宽 1/3
      const cabH = 2.4;
      const cabX = x1 - cabSideD / 2 - 0.08;
      const cabZ = z0 + cabFaceW / 2 + 0.25;
      const cabinet = this.makeChineseSideCabinet(cabFaceW, cabSideD, cabH);
      cabinet.position.set(cabX, 0, cabZ);
      cabinet.rotation.y = -Math.PI / 2;
      this.scene.add(cabinet);
      this.colliders.push({
        minX: x1 - cabSideD - 0.12,
        maxX: x1 - 0.04,
        minZ: z0 + 0.1,
        maxZ: z0 + cabFaceW + 0.35,
      });

      // 紧靠柜右侧（+Z）：L 形铁质镂空格挡 + 工作桌椅
      this.addPaintBoothNextToCabinet(cabX, cabZ, cabFaceW, cabSideD, cabH);

      const panelPitch = 1.05;

      // 最大中式柜对面：朝向同走廊工位（长边沿 X）；离大漆墙约两块亚克力
      this.addPaintDeskOppositeLargeCabinet(x0, cabZ, cabFaceW, panelPitch);

      // 另一远离走廊墙角（外墙 +Z 端）：五列诗柜 / 玻璃档案柜
      // 面宽 ≈ 3 列亚克力板（panelW 1.05），进深 ≈ 单列柜门宽
      const archiveFaceW = panelPitch * 3;
      const archiveD = archiveFaceW / 5;
      const archiveH = 2.35;
      const archiveX = x1 - archiveD / 2 - 0.06;
      const archiveZ = z1 - archiveFaceW / 2 - 0.1;
      const archiveCab = this.makeFiveBayPoemCabinet(archiveFaceW, archiveD, archiveH);
      archiveCab.position.set(archiveX, 0, archiveZ);
      archiveCab.rotation.y = -Math.PI / 2; // 柜门朝走廊（-X）
      this.scene.add(archiveCab);
      this.colliders.push({
        minX: x1 - archiveD - 0.1,
        maxX: x1 - 0.02,
        minZ: z1 - archiveFaceW - 0.18,
        maxZ: z1 - 0.04,
      });

      // 诗柜左侧（-Z，靠车间内侧）：L 格挡 + 同尺寸工作桌，距柜约一块亚克力板
      this.addPaintBoothBesidePoemCabinet(
        archiveX,
        archiveZ,
        archiveFaceW,
        archiveD,
        archiveH,
        cabSideD,
        panelPitch
      );

      // 柜门前：榫卯式木架 + 红漆画板（正对中部玻璃门）
      // 朝走廊(X)长 = 两块亚克力宽；平行柜门(Z)宽 = 略窄于三列玻璃；高 ≈ 柜一半
      const glassDoorW = archiveFaceW / 5;
      const rackLen = panelPitch * 2; // 指向走廊
      const rackWid = glassDoorW * 3 * 0.9; // 平行柜门，比三列玻璃略窄
      const rackH = archiveH * 0.5;
      const cabFaceX = archiveX - archiveD / 2;
      const rackGap = panelPitch; // 离柜约一块亚克力板宽
      // make：len=沿 X（朝走廊），wid=沿 Z（平行柜门）
      const rack = this.makeTenonPaintBoardRack(rackLen, rackWid, rackH, 7);
      const tallRackX = cabFaceX - rackGap - rackLen / 2;
      rack.position.set(tallRackX, 0, archiveZ);
      this.scene.add(rack);
      this.colliders.push({
        minX: cabFaceX - rackGap - rackLen - 0.08,
        maxX: cabFaceX - rackGap + 0.08,
        minZ: archiveZ - rackWid / 2 - 0.1,
        maxZ: archiveZ + rackWid / 2 + 0.1,
      });

      // 高架靠走廊一侧：半高榫卯架；盒在顶面靠里靠后，锁朝车间（-Z）
      // 从高架一侧→走廊：5、4、3（面朝架子时左→右）
      const halfRackH = rackH * 0.5;
      const halfRackLen = rackLen * 0.65;
      const halfRackWid = rackWid * 0.75;
      const halfGap = 0.14;
      const halfRackX = tallRackX - rackLen / 2 - halfGap - halfRackLen / 2;
      const halfRack = this.makeTenonPaintBoardRack(halfRackLen, halfRackWid, halfRackH, 3);
      halfRack.position.set(halfRackX, 0, archiveZ);
      this.scene.add(halfRack);
      // 顶面平整木板，便于落盒（对照实拍低台面）
      const topPlank = new THREE.Mesh(
        new THREE.BoxGeometry(halfRackLen * 0.96, 0.03, halfRackWid * 0.96),
        this.mat(0xb8a888, null, { roughness: 0.7, metalness: 0.04 })
      );
      topPlank.position.set(halfRackX, halfRackH + 0.015, archiveZ);
      this.scene.add(topPlank);
      // 三列与柜子平行（沿 Z）；总宽略窄于架宽；盒子放大
      const boxSpanZ = halfRackWid * 0.92;
      const boxStacks = this.makeLacquerBoxStacks([5, 4, 3], boxSpanZ);
      // 整组靠里（朝高架 +X），Z 向居中铺满架宽
      boxStacks.position.set(halfRackX + halfRackLen * 0.12, halfRackH + 0.03, archiveZ);
      this.scene.add(boxStacks);
      this.colliders.push({
        minX: halfRackX - halfRackLen / 2 - 0.08,
        maxX: halfRackX + halfRackLen / 2 + 0.15,
        minZ: archiveZ - halfRackWid / 2 - 0.1,
        maxZ: archiveZ + halfRackWid / 2 + 0.1,
      });

      // 邻近木架的 +Z 亚克力墙：高剪影两幅保持原位；半高山水/佛像挪到靠走廊一侧
      const wallH = 3.2;
      const artH = wallH * (2 / 3);
      const artW = artH / 2.35;
      const halfH = artH * 0.5;
      const lean = 0.2;
      const gap = 0.16;
      const placeArt = (panel, w, h, ax) => {
        const ay = h / 2 + 0.02;
        const az = z1 - 0.08 - Math.sin(lean) * (h / 2);
        panel.position.set(ax, ay, az);
        panel.rotation.order = "YXZ";
        panel.rotation.y = Math.PI;
        panel.rotation.x = -lean;
        this.scene.add(panel);
      };

      // 高画：维持最初中间靠里位置
      const tallCenterX = x0 + (x1 - x0) * 0.62;
      for (let i = 0; i < 2; i++) {
        const panel = this.makeSilhouetteArtPanel(artW, artH, i);
        placeArt(panel, artW, artH, tallCenterX + (i - 0.5) * (artW + gap));
      }

      // 矮画：靠走廊一侧；再往左（朝高画）一板；略放大；两画间距一板
      const shortScale = 1.18;
      const shortH = halfH * shortScale;
      const shortSpecs = [
        { kind: "land", w: shortH * 0.98, h: shortH },
        { kind: "buddha", w: shortH / 1.7, h: shortH },
      ];
      // 原起点 x0+0.45，往左（+X，朝车间内侧/高画）挪一板
      let cursor = x0 + 0.45 + panelPitch;
      for (const spec of shortSpecs) {
        const panel =
          spec.kind === "land"
            ? this.makeLandscapeArtPanel(spec.w, spec.h)
            : this.makeBuddhaArtPanel(spec.w, spec.h);
        placeArt(panel, spec.w, spec.h, cursor + spec.w / 2);
        cursor += spec.w + panelPitch; // 中间隔开一块亚克力板
      }

      // 靠墙画不作碰撞，窄道可通行

      // 靠走廊大漆墙：L 格挡+桌 ⊥ 大漆墙、∥先前工位；门北侧贴齐不挡门
      this.addPaintBoothOnCorridorLacquerWall(x0, z0, z1);
      // 空调工位靠车间内侧空地：脸对脸镜像格挡+桌（不要画架/椅凳；不是门两侧）
      this.addPaintBoothOnCorridorLacquerWallMirror(x0);

      // 描金彩绘小桌：贴诗柜工位格挡外侧，椅在左侧；长边∥其它桌
      this.addMiaojinPaintDesk(
        archiveX,
        archiveZ,
        archiveFaceW,
        archiveD,
        cabSideD,
        panelPitch
      );

      // 门南侧空位：同款描金桌，贴大漆墙（不要地面白纸+漆盒）
      this.addMiaojinPaintDeskByDoor(x0);
    }

    addMiaojinPaintDeskByDoor(wallX) {
      // 门南侧（-Z）贴大漆墙；长边沿 X∥诗柜旁描金桌；北沿离开门洞
      const deskLen = 2.85;
      const deskWid = (deskLen / 6) * 2.05;
      const doorHalf = 1.05;
      const deskNearX = wallX + 0.12;
      const deskX = deskNearX + deskLen / 2;
      const backZ = -doorHalf - 0.18;
      const deskZ = backZ - deskWid / 2;
      this.placeMiaojinPaintDeskSetup(deskX, deskZ, deskLen, deskWid);
    }

    addMiaojinPaintDesk(
      archiveX,
      archiveZ,
      archiveFaceW,
      archiveD,
      refDeskLen,
      panelPitch = 1.05
    ) {
      // 桌背靠诗柜 L 格挡外侧（朝车间的一面）；椅在桌前左侧（-Z）
      const frontX = archiveX - archiveD / 2;
      const sideZ = archiveZ - archiveFaceW / 2;
      const poemDeskWid = (refDeskLen / 6) * 2;
      const poemDeskZ = sideZ - panelPitch - poemDeskWid / 2;
      const sideScreenZ = poemDeskZ - poemDeskWid / 2 - 0.06;

      const deskLen = 2.85;
      const deskWid = (deskLen / 6) * 2.05;
      // 背贴格挡，整体在格挡 -Z 一侧
      const deskZ = sideScreenZ - deskWid / 2 - 0.05;
      const deskX = frontX - deskLen / 2;
      // 地面白纸靠外墙
      const floorPaperX = archiveX + archiveD / 2 - 0.1 - 0.5;
      this.placeMiaojinPaintDeskSetup(deskX, deskZ, deskLen, deskWid, {
        floorPaperX,
        floorPaperZOffset: -1.15,
        floorSeed: 11,
      });
    }

    placeMiaojinPaintDeskSetup(deskX, deskZ, deskLen, deskWid, opts = {}) {
      // 同款配置：描金桌 + 四官帽椅（-Z）+ 蓝漆盒/台灯 + 地面白纸大漆盒
      const backZ = deskZ + deskWid / 2;
      const frontZ = deskZ - deskWid / 2;
      const surfY = 0.74 + 0.025;
      const floorPaperX = opts.floorPaperX;
      const floorPaperZOffset = opts.floorPaperZOffset ?? -1.15;
      const floorSeed = opts.floorSeed ?? 11;

      const desk = this.makeMiaojinPaintDesk(deskLen, deskWid);
      desk.position.set(deskX, 0, deskZ);
      this.scene.add(desk);

      const chairW = 0.46;
      const chairCount = 4;
      const chairMargin = 0.28;
      const chairSpan = deskLen - chairMargin * 2;
      const chairPitch = chairSpan / (chairCount - 1);
      const chairZ = frontZ - chairW * 0.55 - 0.08;
      const chairStartX = deskX - deskLen / 2 + chairMargin;
      for (let i = 0; i < chairCount; i++) {
        const chair = this.makeOfficialHatChair(chairW);
        const chairX = chairStartX + i * chairPitch;
        chair.position.set(chairX, 0, chairZ);
        chair.rotation.y = 0; // 面朝 +Z 向桌子
        this.scene.add(chair);
        this.colliders.push({
          minX: chairX - chairW / 2,
          maxX: chairX + chairW / 2,
          minZ: chairZ - chairW * 0.48,
          maxZ: chairZ + chairW * 0.48,
        });
      }

      const box = this.makeBlueLacquerDeskBox(0.28, 0.2, 0.09);
      box.position.set(deskX + deskLen * 0.2, surfY, backZ - 0.12);
      this.scene.add(box);
      const lamp = this.makeBlackSwingArmLamp();
      lamp.scale.setScalar(0.92);
      lamp.position.set(deskX + deskLen * 0.25, 0.74, deskZ);
      lamp.rotation.y = 0.4;
      this.scene.add(lamp);

      this.colliders.push({
        minX: deskX - deskLen / 2,
        maxX: deskX + deskLen / 2,
        minZ: deskZ - deskWid / 2,
        maxZ: deskZ + deskWid / 2,
      });

      if (floorPaperX == null) return;

      const paperLen = 1.65;
      const paperWid = 1.0;
      const paperZ = chairZ + floorPaperZOffset;
      const paper = new THREE.Mesh(
        new THREE.PlaneGeometry(paperWid, paperLen),
        this.mat(0xf7f4ec, null, { roughness: 0.92, side: THREE.DoubleSide })
      );
      paper.rotation.x = -Math.PI / 2;
      paper.position.set(floorPaperX, 0.01, paperZ);
      this.scene.add(paper);

      const boxW = 0.58;
      const boxD = 0.45;
      const boxH = 0.2;
      const floorBox = this.makeLacquerGiftBox(boxW, boxD, boxH, true, floorSeed);
      floorBox.position.set(floorPaperX + 0.04, 0.01 + boxH / 2, paperZ);
      floorBox.rotation.y = Math.PI / 2;
      this.scene.add(floorBox);
      this.colliders.push({
        minX: floorPaperX - boxD / 2 - 0.02,
        maxX: floorPaperX + boxD / 2 + 0.08,
        minZ: paperZ - boxW / 2 - 0.02,
        maxZ: paperZ + boxW / 2 + 0.02,
      });
    }

    makeMiaojinPaintDesk(tw, td) {
      // 描金彩绘小桌：深褐漆面 + 金彩纹，略低于普通工作桌
      const g = new THREE.Group();
      const topY = 0.74;
      const goldMap = this.makeMiaojinDeskTexture();
      const topMat = new THREE.MeshStandardMaterial({
        map: goldMap,
        roughness: 0.35,
        metalness: 0.28,
      });
      const wood = this.mat(0x2a1810, null, { roughness: 0.55, metalness: 0.08 });
      const gold = this.mat(0xd4b060, null, { roughness: 0.35, metalness: 0.55 });

      const top = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.05, td), topMat);
      top.position.y = topY;
      g.add(top);
      // 桌沿描金线
      const lip = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.02, 0.02, td + 0.02), gold);
      lip.position.y = topY - 0.02;
      g.add(lip);
      const apron = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.96, 0.08, td * 0.96), wood);
      apron.position.y = topY - 0.07;
      g.add(apron);

      for (const [lx, lz] of [
        [-tw / 2 + 0.07, -td / 2 + 0.07],
        [tw / 2 - 0.07, -td / 2 + 0.07],
        [-tw / 2 + 0.07, td / 2 - 0.07],
        [tw / 2 - 0.07, td / 2 - 0.07],
      ]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.055, topY - 0.05, 0.055), wood);
        leg.position.set(lx, (topY - 0.05) / 2, lz);
        g.add(leg);
        const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.06), gold);
        cuff.position.set(lx, 0.04, lz);
        g.add(cuff);
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.8, 0.035, 0.035), wood);
      rail.position.set(0, 0.26, 0);
      g.add(rail);
      return g;
    }

    makeMiaojinDeskTexture() {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 256;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#2a1812";
      ctx.fillRect(0, 0, 512, 256);
      // 深漆底微纹
      ctx.fillStyle = "rgba(50,30,20,0.5)";
      for (let i = 0; i < 40; i++) {
        ctx.fillRect((i * 47) % 500, (i * 31) % 240, 12, 3);
      }
      // 描金卷草 / 回纹
      ctx.strokeStyle = "#d4b060";
      ctx.fillStyle = "rgba(212,176,96,0.35)";
      ctx.lineWidth = 2.2;
      for (let i = 0; i < 6; i++) {
        const x = 40 + i * 80;
        const y = 70 + (i % 2) * 60;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + 25, y - 45, x + 55, y + 20, x + 30, y + 50);
        ctx.bezierCurveTo(x + 10, y + 70, x - 10, y + 20, x, y);
        ctx.stroke();
        ctx.fill();
      }
      // 边框金线
      ctx.strokeStyle = "#e0c070";
      ctx.lineWidth = 4;
      ctx.strokeRect(12, 12, 488, 232);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(24, 24, 464, 208);
      // 点金
      ctx.fillStyle = "#e8d090";
      for (let i = 0; i < 35; i++) {
        ctx.beginPath();
        ctx.arc((i * 67) % 490, (i * 41) % 240, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2, 1);
      return tex;
    }

    makeOfficialHatChair(targetW = 0.5) {
      // 对照实拍：深色官帽椅——搭脑出头、高靠背、无扶手直搭脑式
      const g = new THREE.Group();
      const wood = this.mat(0x1e1410, null, { roughness: 0.48, metalness: 0.06 });
      const woodHi = this.mat(0x3a2820, null, { roughness: 0.45, metalness: 0.08 });
      const seatW = targetW;
      const seatD = targetW * 0.88;
      const seatY = 0.46;
      const legT = 0.038;
      const inset = 0.045;

      for (const [lx, lz] of [
        [-seatW / 2 + inset, -seatD / 2 + inset],
        [seatW / 2 - inset, -seatD / 2 + inset],
        [-seatW / 2 + inset, seatD / 2 - inset],
        [seatW / 2 - inset, seatD / 2 - inset],
      ]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(legT, seatY - 0.02, legT), wood);
        leg.position.set(lx, (seatY - 0.02) / 2, lz);
        g.add(leg);
      }
      // 席面
      const seat = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.04, 0.035, seatD - 0.04), woodHi);
      seat.position.y = seatY;
      g.add(seat);
      // 后腿向上延伸为靠背立柱
      const backH = seatW * 1.15;
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(legT * 0.95, backH, legT * 0.95),
          wood
        );
        post.position.set(
          sx * (seatW / 2 - inset),
          seatY + backH / 2,
          -seatD / 2 + inset
        );
        g.add(post);
      }
      // 靠背中板
      const splat = new THREE.Mesh(
        new THREE.BoxGeometry(seatW * 0.55, backH * 0.72, 0.022),
        woodHi
      );
      splat.position.set(0, seatY + backH * 0.42, -seatD / 2 + inset + 0.01);
      splat.rotation.x = -0.06;
      g.add(splat);
      // 搭脑（两端出头上翘）
      const topRail = new THREE.Mesh(
        new THREE.BoxGeometry(seatW + 0.12, 0.04, 0.045),
        wood
      );
      topRail.position.set(0, seatY + backH + 0.01, -seatD / 2 + inset);
      g.add(topRail);
      for (const sx of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.05), woodHi);
        ear.position.set(sx * (seatW / 2 + 0.04), seatY + backH + 0.03, -seatD / 2 + inset);
        ear.rotation.z = sx * -0.35;
        g.add(ear);
      }
      // 下步步棖
      for (const sz of [-1, 1]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(seatW - inset * 2, legT * 0.7, legT * 0.7),
          wood
        );
        rail.position.set(0, 0.16, sz * (seatD / 2 - inset));
        g.add(rail);
      }
      return g;
    }

    addPaintDeskOppositeLargeCabinet(wallX, cabZ, cabFaceW, panelPitch = 1.05) {
      // 最大柜对面：朝向同走廊工位——长边沿 X、L 格挡在桌背(-Z)、椅在桌前(+Z)
      // 整体靠走廊侧贴齐大漆墙；L 拐角在远离大漆墙（+X）一端
      const iron = this.mat(0x6a7076, null, { metalness: 0.55, roughness: 0.42 });
      const ironDark = this.mat(0x4a5056, null, { metalness: 0.5, roughness: 0.5 });
      const deskLen = 3.35; // 沿 X，同走廊那桌
      const wingLen = deskLen / 6;
      const deskWid = wingLen * 2.1; // 沿 Z
      const screenH = 2.12;
      const surfY = 0.75 + 0.03;
      // 墙体外皮约 wallX+0.08，桌近端贴齐
      const deskNearX = wallX + 0.1;
      const deskX = deskNearX + deskLen / 2;
      // 正对大柜中段
      const deskZ = cabZ + cabFaceW * 0.06;
      const sideScreenZ = deskZ - deskWid / 2 - 0.04;
      const backZ = deskZ - deskWid / 2;
      const frontZ = deskZ + deskWid / 2;
      const wingX = deskX + deskLen / 2;

      // L 形铁质镂空格挡（长边∥桌背，短翼沿桌侧伸出）
      const longScreen = this.makeIronLatticeScreen(deskLen, screenH, iron, ironDark, true);
      longScreen.position.set(deskX, 0, sideScreenZ);
      this.scene.add(longScreen);

      const wing = this.makeIronLatticeScreen(wingLen, screenH, iron, ironDark, false);
      wing.rotation.y = Math.PI / 2;
      wing.position.set(wingX, 0, sideScreenZ + wingLen / 2);
      this.scene.add(wing);

      const corner = new THREE.Mesh(new THREE.BoxGeometry(0.07, screenH, 0.07), ironDark);
      corner.position.set(wingX, screenH / 2, sideScreenZ);
      this.scene.add(corner);

      const desk = this.makeDarkWorkDesk(deskLen, deskWid);
      desk.position.set(deskX, 0, deskZ);
      this.scene.add(desk);

      // 红木黑垫扶手椅
      const chairW = 0.52;
      const chair = this.makeRedWoodArmchair(chairW);
      const chairX = deskX - deskLen * 0.05;
      const chairZ = frontZ + chairW * 0.55 + 0.08;
      chair.position.set(chairX, 0, chairZ);
      chair.rotation.y = Math.PI; // 面朝桌子（-Z），同走廊工位
      this.scene.add(chair);

      // 桌面：靠格挡红漆盒 + 碗/布/水瓶；左端风扇与台灯
      const boxes = this.makeDeskLacquerBoxRow(5, deskLen * 0.45);
      boxes.position.set(deskX - deskLen * 0.05, surfY, backZ + 0.12);
      this.scene.add(boxes);

      const fan = this.makeWhiteDesktopFan();
      fan.scale.setScalar(0.72);
      fan.position.set(deskNearX + 0.28, surfY, backZ + 0.18);
      fan.rotation.y = 0.6;
      this.scene.add(fan);

      const lamp = this.makeClipTaskLight();
      lamp.scale.setScalar(1.15);
      lamp.position.set(deskNearX + 0.15, surfY + 0.02, deskZ);
      lamp.rotation.y = Math.PI / 2;
      this.scene.add(lamp);

      for (let i = 0; i < 3; i++) {
        const bowl = this.makeWhiteWorkBowl();
        bowl.position.set(deskX - 0.15 + i * 0.12, surfY, deskZ + 0.08);
        this.scene.add(bowl);
      }
      const clothA = this.makeDeskCloth(0x2a6ad4);
      clothA.position.set(deskX + 0.25, surfY + 0.005, deskZ + 0.12);
      clothA.rotation.y = -0.35;
      this.scene.add(clothA);
      const clothB = this.makeDeskCloth(0x5a3a9a);
      clothB.position.set(deskX + 0.38, surfY + 0.005, deskZ + 0.02);
      clothB.rotation.y = 0.5;
      this.scene.add(clothB);

      const bottle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.028, 0.22, 12),
        this.mat(0xd8e8f0, null, { roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.55 })
      );
      bottle.position.set(deskX + 0.55, surfY + 0.11, deskZ - 0.05);
      this.scene.add(bottle);

      // 碰撞贴边：桌 / 长格挡 / 短翼 / 椅
      const latticeT = 0.045;
      this.colliders.push({
        minX: deskX - deskLen / 2,
        maxX: deskX + deskLen / 2,
        minZ: deskZ - deskWid / 2,
        maxZ: deskZ + deskWid / 2,
      });
      this.colliders.push({
        minX: deskX - deskLen / 2,
        maxX: deskX + deskLen / 2,
        minZ: sideScreenZ - latticeT / 2,
        maxZ: sideScreenZ + latticeT / 2,
      });
      this.colliders.push({
        minX: wingX - latticeT / 2,
        maxX: wingX + latticeT / 2,
        minZ: sideScreenZ,
        maxZ: sideScreenZ + wingLen,
      });
      this.colliders.push({
        minX: chairX - chairW / 2,
        maxX: chairX + chairW / 2,
        minZ: chairZ - chairW * 0.46,
        maxZ: chairZ + chairW * 0.46,
      });
    }

    makeGreyDeskLatticeRack(width, height) {
      // 浅灰方管格架：下部直格，上部菱形斜撑（对照实拍，贴桌背）
      const g = new THREE.Group();
      const grey = this.mat(0x9aa0a6, null, { roughness: 0.55, metalness: 0.22 });
      const greyDark = this.mat(0x7a8086, null, { roughness: 0.5, metalness: 0.25 });
      const bar = 0.028;
      const depth = 0.06;
      // 外框
      for (const [w, h, x, y] of [
        [width, bar, 0, height - bar / 2],
        [width, bar, 0, bar / 2],
        [bar, height, -width / 2 + bar / 2, height / 2],
        [bar, height, width / 2 - bar / 2, height / 2],
      ]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), grey);
        m.position.set(x, y, 0);
        g.add(m);
      }
      // 中横档分上下
      const midY = height * 0.42;
      const mid = new THREE.Mesh(new THREE.BoxGeometry(width - bar, bar, depth * 0.9), greyDark);
      mid.position.set(0, midY, 0);
      g.add(mid);
      // 下部竖档
      const cols = 5;
      for (let c = 1; c < cols; c++) {
        const x = -width / 2 + (c / cols) * width;
        const v = new THREE.Mesh(new THREE.BoxGeometry(bar * 0.85, midY - bar, depth * 0.85), grey);
        v.position.set(x, midY / 2, 0);
        g.add(v);
      }
      // 上部：每格菱形 / X 撑
      const topH = height - midY;
      const topCols = 4;
      const cellW = (width - bar) / topCols;
      for (let c = 0; c < topCols; c++) {
        const cx = -width / 2 + bar / 2 + cellW / 2 + c * cellW;
        const cy = midY + topH / 2;
        const len = Math.hypot(cellW * 0.85, topH * 0.75);
        for (const rot of [0.7, -0.7]) {
          const cross = new THREE.Mesh(new THREE.BoxGeometry(len, bar * 0.7, depth * 0.7), greyDark);
          cross.position.set(cx, cy, 0);
          cross.rotation.z = rot;
          g.add(cross);
        }
      }
      // 底脚落在桌面
      for (const sx of [-1, 1]) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.08), greyDark);
        foot.position.set(sx * (width / 2 - 0.08), 0.01, 0.02);
        g.add(foot);
      }
      return g;
    }

    makeRedWoodArmchair(targetW = 0.52) {
      // 红木框 + 黑软垫靠背扶手椅
      const g = new THREE.Group();
      const wood = this.mat(0x8a3a28, null, { roughness: 0.55, metalness: 0.06 });
      const woodDark = this.mat(0x5a2418, null, { roughness: 0.6 });
      const leather = this.mat(0x1a1a1c, null, { roughness: 0.4, metalness: 0.04 });
      const seatW = targetW;
      const seatD = targetW * 0.95;
      const seatY = 0.44;
      const legT = 0.045;
      const inset = 0.04;
      for (const [lx, lz] of [
        [-seatW / 2 + inset, -seatD / 2 + inset],
        [seatW / 2 - inset, -seatD / 2 + inset],
        [-seatW / 2 + inset, seatD / 2 - inset],
        [seatW / 2 - inset, seatD / 2 - inset],
      ]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(legT, seatY - 0.02, legT), woodDark);
        leg.position.set(lx, (seatY - 0.02) / 2, lz);
        g.add(leg);
      }
      const seat = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.04, 0.07, seatD - 0.04), leather);
      seat.position.y = seatY + 0.02;
      g.add(seat);
      const backH = seatW * 0.85;
      const back = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.06, backH, 0.06), leather);
      back.position.set(0, seatY + 0.06 + backH / 2, -seatD / 2 + 0.03);
      back.rotation.x = -0.1;
      g.add(back);
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(legT, backH + 0.1, legT), wood);
        post.position.set(sx * (seatW / 2 - inset), seatY + (backH + 0.1) / 2, -seatD / 2 + 0.02);
        g.add(post);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(legT, legT, seatD * 0.7), wood);
        arm.position.set(sx * (seatW / 2 - inset), seatY + 0.22, 0.02);
        g.add(arm);
      }
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.02, legT, legT), wood);
      topRail.position.set(0, seatY + backH + 0.04, -seatD / 2 + 0.02);
      g.add(topRail);
      return g;
    }

    makeDeskLacquerBoxRow(n, spanX) {
      const g = new THREE.Group();
      const gap = 0.02;
      const boxW = (spanX - gap * (n - 1)) / n;
      const boxD = boxW * 0.75;
      const boxH = boxW * 0.45;
      for (let i = 0; i < n; i++) {
        const stack = 1 + (i % 3 === 0 ? 1 : 0);
        for (let k = 0; k < stack; k++) {
          const box = this.makeLacquerGiftBox(boxW, boxD, boxH, k === stack - 1, i * 3 + k);
          box.position.set(-spanX / 2 + boxW / 2 + i * (boxW + gap), boxH / 2 + k * (boxH + 0.002), 0);
          g.add(box);
        }
      }
      return g;
    }

    makeWhiteWorkBowl() {
      const g = new THREE.Group();
      const porcelain = this.mat(0xf4f2ec, null, { roughness: 0.35, metalness: 0.05 });
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), porcelain);
      bowl.position.y = 0.02;
      g.add(bowl);
      return g;
    }

    makeDeskCloth(color) {
      const mat = this.mat(color, null, { roughness: 0.85, side: THREE.DoubleSide });
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.12), mat);
      cloth.rotation.x = -Math.PI / 2;
      return cloth;
    }

    addPaintBoothOnCorridorLacquerWall(wallX, zMin, zMax) {
      // 长边沿 X（∥先前工位、⊥大漆墙）；门北侧不挡门
      // 原图左右：画作在靠走廊端且背朝走廊；L 拐角在远离走廊（+X）一端
      const iron = this.mat(0x6a7076, null, { metalness: 0.55, roughness: 0.42 });
      const ironDark = this.mat(0x4a5056, null, { metalness: 0.5, roughness: 0.5 });

      const doorHalf = 1.05;
      const deskLen = 3.35; // 沿 X，桌子恢复原长
      const wingLen = deskLen / 6;
      const deskWid = wingLen * 2.1; // 沿 Z
      const screenH = 2.12;
      // 门北第一开间：格挡对齐大漆墙第一道玻璃交界立柱，门侧留走道
      const wallZ1 = 8.55;
      const bayCount = Math.max(1, Math.round((wallZ1 - doorHalf) / 2.35));
      const bayW = (wallZ1 - doorHalf) / bayCount;
      const walk = 0.7;
      const acrylicThick = 0.07;
      const sideScreenZ = doorHalf + bayW; // ≈3.55，两块玻璃交界
      const deskX = wallX + 0.22 + deskLen / 2;
      const deskZ = sideScreenZ + deskWid / 2 + 0.04;
      // 拐角在远离走廊一端（+X），与桌子短边齐
      const wingX = deskX + deskLen / 2;
      const deskEndX = wingX;

      const longScreen = this.makeIronLatticeScreen(deskLen, screenH, iron, ironDark, true);
      longScreen.position.set(deskX, 0, sideScreenZ);
      this.scene.add(longScreen);

      const wing = this.makeIronLatticeScreen(wingLen, screenH, iron, ironDark, false);
      wing.rotation.y = Math.PI / 2;
      wing.position.set(wingX, 0, sideScreenZ + wingLen / 2);
      this.scene.add(wing);

      const corner = new THREE.Mesh(new THREE.BoxGeometry(0.07, screenH, 0.07), ironDark);
      corner.position.set(wingX, screenH / 2, sideScreenZ);
      this.scene.add(corner);

      // 格挡玻璃上：证书/执照（红章）
      for (let i = 0; i < 5; i++) {
        const cert = this.makeWallCertificate(0.26 + (i % 2) * 0.04, 0.34 + (i % 3) * 0.02);
        cert.position.set(
          deskX - deskLen * 0.28 + i * 0.42,
          1.05 + (i % 2) * 0.38,
          sideScreenZ + 0.035
        );
        this.scene.add(cert);
      }

      const desk = this.makeDarkWorkDesk(deskLen, deskWid);
      desk.position.set(deskX, 0, deskZ);
      this.scene.add(desk);

      // 工作桌上方：挂在对应开间大漆楣板正中（车间内侧贴面，不穿模）
      const acDoorHalf = 1.05;
      const acSpanZ0 = acDoorHalf;
      const acSpanZ1 = 8.55;
      const acBayN = Math.max(1, Math.round((acSpanZ1 - acSpanZ0) / 2.35));
      const acBayW = (acSpanZ1 - acSpanZ0) / acBayN;
      const acBayI = Math.min(
        acBayN - 1,
        Math.max(0, Math.floor((deskZ - acSpanZ0) / acBayW))
      );
      const acZ = acSpanZ0 + acBayI * acBayW + acBayW / 2;
      const acY = (2.38 + (3.2 - 0.08)) / 2; // 楣板竖直中心
      const ac = this.makeWallAirConditioner();
      // 墙体外皮约 wallX+0.08，整机沿 +X 探出，背板贴面
      ac.position.set(wallX + 0.085, acY, acZ);
      this.scene.add(ac);

      const surfY = 0.75 + 0.025;
      const deskFrontZ = deskZ + deskWid / 2;
      const deskNearX = deskX - deskLen / 2;
      const backZ = sideScreenZ + 0.13;
      const midZ = deskZ + 0.02;
      const frontZ = deskFrontZ - 0.14;

      // —— 对照实拍桌面：左→右 木刷架 / 纸叠+工具 / 暖瓶+表 / 漆瓶+草 / 石块盘 / 风扇 / 吊兰 / 绿铁盒 / 模型简介 ——
      const rack = this.makeWorkshopBrushRack();
      rack.scale.setScalar(1.15);
      rack.position.set(deskNearX + 0.42, surfY, frontZ + 0.02);
      rack.rotation.y = 0.08;
      this.scene.add(rack);

      const papers = this.makeDeskPaperStack();
      papers.position.set(deskNearX + 0.22, surfY, midZ + 0.06);
      papers.rotation.y = -0.2;
      this.scene.add(papers);

      const tools = this.makeDeskToolScatter();
      tools.position.set(deskNearX + 0.72, surfY, midZ);
      this.scene.add(tools);

      const thermos = this.makeBronzeThermos();
      thermos.position.set(deskX - deskLen * 0.12, surfY, midZ - 0.04);
      this.scene.add(thermos);

      const gauge = this.makeDeskGaugeClock();
      gauge.position.set(deskX - deskLen * 0.06, surfY, frontZ + 0.04);
      this.scene.add(gauge);

      // 两漆瓶 + 两盆栽并排靠格挡
      const rowZ = backZ + 0.02;
      const rowX0 = deskX - deskLen * 0.06;
      const rowGap = 0.125;
      for (let i = 0; i < 2; i++) {
        const bottle = this.makeBlackGoldLacquerBottle();
        bottle.position.set(rowX0 + i * rowGap, surfY, rowZ);
        this.scene.add(bottle);
      }
      for (let i = 0; i < 2; i++) {
        const pot = this.makeSpiderPlantPot();
        pot.scale.setScalar(0.82 + i * 0.06);
        pot.position.set(rowX0 + (2 + i) * rowGap + 0.02, surfY, rowZ);
        this.scene.add(pot);
      }

      const tray = this.makeSealStoneTray();
      tray.position.set(deskX + deskLen * 0.22, surfY, midZ);
      tray.rotation.y = -0.12;
      this.scene.add(tray);

      const fan = this.makeWhiteDesktopFan();
      fan.scale.setScalar(0.88);
      const fanX = deskX + deskLen * 0.34;
      const fanZ = frontZ + 0.02;
      fan.position.set(fanX, surfY, fanZ);

      const leafA = this.makeBroadLeafPlantPot();
      leafA.scale.setScalar(0.8);
      leafA.position.set(deskX + deskLen * 0.34, surfY, midZ + 0.12);
      this.scene.add(leafA);
      const leafB = this.makeBroadLeafPlantPot();
      leafB.scale.setScalar(0.72);
      leafB.position.set(deskX + deskLen * 0.4, surfY, frontZ + 0.06);
      this.scene.add(leafB);

      const greenBox = this.makeGreenMetalToolBox();
      greenBox.position.set(deskEndX - 0.2, surfY, midZ + 0.02);
      greenBox.rotation.y = -0.15;
      this.scene.add(greenBox);

      // 模型简介：立在桌面右端靠格挡（对照实拍）
      const poster = this.makeModelIntroPoster(0.36, 0.5);
      poster.position.set(deskEndX - 0.42, surfY + 0.25, backZ + 0.01);
      poster.rotation.y = 0.04;
      this.scene.add(poster);

      // 左端格挡上的夹式台灯
      const clipLamp = this.makeClipTaskLight();
      clipLamp.position.set(deskNearX + 0.2, 1.48, sideScreenZ + 0.04);
      this.scene.add(clipLamp);

      // 画架高 = 格挡 4/5；画作比架小一圈；画架/凳拉开墙与桌，避免穿模
      const easelH = screenH * 0.8;
      const paintH = easelH * 0.68;
      const paintW = paintH / 1.55;
      const easel = this.makePainterEaselWithArt(paintW, paintH, easelH);
      // 往车间内/桌前侧挪出，离开大漆墙裙边
      const easelX = deskNearX + 0.55;
      const easelZ = deskFrontZ + 0.55;
      easel.position.set(easelX, 0, easelZ);
      easel.rotation.y = Math.PI / 2; // 背面朝走廊，画面朝凳
      this.scene.add(easel);

      const stool = this.makeWoodStool(0.38);
      const stoolX = easelX + 0.72;
      const stoolZ = easelZ + 0.06;
      stool.position.set(stoolX, 0, stoolZ);
      this.scene.add(stool);

      fan.rotation.y = Math.atan2(stoolX - fanX, stoolZ - fanZ);
      this.scene.add(fan);

      // 砖红小木架：从桌底取出，放在椅子与桌子之间，留空隙
      const shelfW = 0.5;
      const shelfD = 0.42;
      const shelf = this.makeUnderDeskShelf(shelfW, shelfD, 0.62);
      const shelfX = stoolX + 0.48;
      const shelfZ = deskFrontZ + 0.2;
      shelf.position.set(shelfX, 0, shelfZ);
      this.scene.add(shelf);

      // 桌子短边：拐角翼挡住靠格挡一段，外侧空余段放成品画；木板正靠拐角，互不交叉
      const wingCoverZ1 = sideScreenZ + wingLen; // 短翼挡住的 Z 上沿
      const deskShortZ0 = deskZ - deskWid / 2;
      const deskShortZ1 = deskZ + deskWid / 2;
      const clearZ0 = Math.max(deskShortZ0, wingCoverZ1) + 0.04;
      const clearZ1 = deskShortZ1 - 0.04;
      const clearW = Math.max(0.45, clearZ1 - clearZ0);
      const clearMidZ = (clearZ0 + clearZ1) / 2;

      // 长木板：贴短翼外皮，与金属翼间距 1.5 亚克力板厚
      const plankH = screenH - 0.18;
      const plankLite = this.mat(0xd4c6a8, null, { roughness: 0.82, metalness: 0.02 });
      const plankWarm = this.mat(0xc8b890, null, { roughness: 0.8, metalness: 0.02 });
      const plankGap = 1.5 * acrylicThick;
      const plankX0 = wingX + 0.022 + plankGap;
      for (let i = 0; i < 7; i++) {
        const h = plankH - (i % 3) * 0.025;
        const faceW = 0.38 + (i % 3) * 0.03;
        const board = new THREE.Mesh(
          new THREE.BoxGeometry(0.028, h, faceW),
          i % 2 ? plankLite : plankWarm
        );
        board.position.set(
          plankX0 + i * 0.026,
          h / 2,
          sideScreenZ + wingLen * 0.35 + (i - 3) * 0.02
        );
        board.rotation.y = 0;
        board.rotation.x = -0.03;
        this.scene.add(board);
      }

      // 成品画：大小相近，宽度对齐短边未被拐角挡住的一段
      const paintKinds = ["land", "land", "buddha"];
      const pw = clearW * 0.92;
      const ph = pw * 0.98;
      for (let i = 0; i < 3; i++) {
        const panel = this.makeLeanFinishedPainting(pw, ph, paintKinds[i]);
        const lean = 0.22;
        panel.position.set(
          deskEndX + 0.1 + i * 0.032,
          (ph / 2) * Math.cos(lean) + 0.02,
          clearMidZ + (i - 1) * 0.03
        );
        panel.rotation.order = "YXZ";
        panel.rotation.y = Math.PI / 2;
        panel.rotation.x = -lean;
        this.scene.add(panel);
      }

      // 碰撞贴合物体边缘（不再用整块空气墙）
      const latticeT = 0.045;
      this.colliders.push({
        minX: deskX - deskLen / 2,
        maxX: deskX + deskLen / 2,
        minZ: sideScreenZ - latticeT / 2,
        maxZ: sideScreenZ + latticeT / 2,
      });
      this.colliders.push({
        minX: wingX - latticeT / 2,
        maxX: wingX + latticeT / 2,
        minZ: sideScreenZ,
        maxZ: sideScreenZ + wingLen,
      });
      this.colliders.push({
        minX: deskX - deskLen / 2,
        maxX: deskX + deskLen / 2,
        minZ: deskZ - deskWid / 2,
        maxZ: deskZ + deskWid / 2,
      });
      this.colliders.push({
        minX: easelX - paintW / 2,
        maxX: easelX + paintW / 2,
        minZ: easelZ - 0.22,
        maxZ: easelZ + 0.28,
      });
      const stoolHalfX = 0.19;
      const stoolHalfZ = 0.16;
      this.colliders.push({
        minX: stoolX - stoolHalfX,
        maxX: stoolX + stoolHalfX,
        minZ: stoolZ - stoolHalfZ,
        maxZ: stoolZ + stoolHalfZ,
      });
      this.colliders.push({
        minX: shelfX - shelfW / 2,
        maxX: shelfX + shelfW / 2,
        minZ: shelfZ - shelfD / 2,
        maxZ: shelfZ + shelfD / 2,
      });
      this.colliders.push({
        minX: wingX + 0.02,
        maxX: wingX + 0.26,
        minZ: sideScreenZ,
        maxZ: sideScreenZ + wingLen * 0.55 + 0.18,
      });
      this.colliders.push({
        minX: deskEndX,
        maxX: deskEndX + 0.2,
        minZ: clearZ0,
        maxZ: clearZ1,
      });
    }

    addPaintBoothOnCorridorLacquerWallMirror(wallX) {
      // 空调工位桌前一侧空地：脸对脸（桌前相对）；L 格挡在远端；无画架/凳/小木架
      const iron = this.mat(0x6a7076, null, { metalness: 0.55, roughness: 0.42 });
      const ironDark = this.mat(0x4a5056, null, { metalness: 0.5, roughness: 0.5 });

      const doorHalf = 1.05;
      const deskLen = 3.35;
      const wingLen = deskLen / 6;
      const deskWid = wingLen * 2.1;
      const screenH = 2.12;
      // 原工位在第一道玻璃交界；本侧与之对坐，中间留出走道（含画架占位）
      const wallZ1 = 8.55;
      const bayCount = Math.max(1, Math.round((wallZ1 - doorHalf) / 2.35));
      const bayW = (wallZ1 - doorHalf) / bayCount;
      const walk = 0.7;
      const origSideZ = doorHalf + bayW; // 与门北工位一致 ≈3.55
      const origDeskZ = origSideZ + deskWid / 2 + 0.04;
      const origFrontZ = origDeskZ + deskWid / 2;
      const faceGap = walk + 0.95; // 对坐走道 + 原侧画架/凳
      const deskFrontZ = origFrontZ + faceGap;
      const deskZ = deskFrontZ + deskWid / 2;
      const sideScreenZ = deskZ + deskWid / 2 + 0.04;
      const deskX = wallX + 0.22 + deskLen / 2;
      const wingX = deskX + deskLen / 2;
      const deskEndX = wingX;

      const longScreen = this.makeIronLatticeScreen(deskLen, screenH, iron, ironDark, true);
      longScreen.position.set(deskX, 0, sideScreenZ);
      this.scene.add(longScreen);

      const wing = this.makeIronLatticeScreen(wingLen, screenH, iron, ironDark, false);
      wing.rotation.y = Math.PI / 2;
      wing.position.set(wingX, 0, sideScreenZ - wingLen / 2);
      this.scene.add(wing);

      const corner = new THREE.Mesh(new THREE.BoxGeometry(0.07, screenH, 0.07), ironDark);
      corner.position.set(wingX, screenH / 2, sideScreenZ);
      this.scene.add(corner);

      for (let i = 0; i < 5; i++) {
        const cert = this.makeWallCertificate(0.26 + (i % 2) * 0.04, 0.34 + (i % 3) * 0.02);
        cert.position.set(
          deskX - deskLen * 0.28 + i * 0.42,
          1.05 + (i % 2) * 0.38,
          sideScreenZ - 0.035
        );
        this.scene.add(cert);
      }

      const desk = this.makeDarkWorkDesk(deskLen, deskWid);
      desk.position.set(deskX, 0, deskZ);
      this.scene.add(desk);

      const surfY = 0.75 + 0.025;
      const deskNearX = deskX - deskLen / 2;
      const backZ = sideScreenZ - 0.13;
      const midZ = deskZ - 0.02;
      const frontZ = deskFrontZ + 0.14;

      const rack = this.makeWorkshopBrushRack();
      rack.scale.setScalar(1.15);
      rack.position.set(deskNearX + 0.42, surfY, frontZ - 0.02);
      rack.rotation.y = -0.08;
      this.scene.add(rack);

      const papers = this.makeDeskPaperStack();
      papers.position.set(deskNearX + 0.22, surfY, midZ - 0.06);
      papers.rotation.y = 0.2;
      this.scene.add(papers);

      const tools = this.makeDeskToolScatter();
      tools.position.set(deskNearX + 0.72, surfY, midZ);
      this.scene.add(tools);

      const thermos = this.makeBronzeThermos();
      thermos.position.set(deskX - deskLen * 0.12, surfY, midZ + 0.04);
      this.scene.add(thermos);

      const gauge = this.makeDeskGaugeClock();
      gauge.position.set(deskX - deskLen * 0.06, surfY, frontZ - 0.04);
      this.scene.add(gauge);

      const rowZ = backZ - 0.02;
      const rowX0 = deskX - deskLen * 0.06;
      const rowGap = 0.125;
      for (let i = 0; i < 2; i++) {
        const bottle = this.makeBlackGoldLacquerBottle();
        bottle.position.set(rowX0 + i * rowGap, surfY, rowZ);
        this.scene.add(bottle);
      }
      for (let i = 0; i < 2; i++) {
        const pot = this.makeSpiderPlantPot();
        pot.scale.setScalar(0.82 + i * 0.06);
        pot.position.set(rowX0 + (2 + i) * rowGap + 0.02, surfY, rowZ);
        this.scene.add(pot);
      }

      const tray = this.makeSealStoneTray();
      tray.position.set(deskX + deskLen * 0.22, surfY, midZ);
      tray.rotation.y = 0.12;
      this.scene.add(tray);

      const fan = this.makeWhiteDesktopFan();
      fan.scale.setScalar(0.88);
      fan.position.set(deskX + deskLen * 0.34, surfY, frontZ - 0.02);
      fan.rotation.y = Math.PI; // 朝对坐空地
      this.scene.add(fan);

      // 阔叶盆栽略往桌心收，避开拐角木架/黑匣
      const leafA = this.makeBroadLeafPlantPot();
      leafA.scale.setScalar(0.8);
      leafA.position.set(deskX + deskLen * 0.08, surfY, midZ - 0.1);
      this.scene.add(leafA);
      const leafB = this.makeBroadLeafPlantPot();
      leafB.scale.setScalar(0.72);
      leafB.position.set(deskX + deskLen * 0.14, surfY, frontZ - 0.04);
      this.scene.add(leafB);

      // 靠摆画墙一侧：格挡拐角处——左四层方木架，右若干中型黑匣（略往桌前，避开格挡横档）
      const shelfSize = 0.3;
      const shelfH = 0.46;
      const shelf = this.makeFourTierSquareShelf(shelfSize, shelfH);
      const shelfX = deskEndX - 0.22;
      const cornerZ = midZ - 0.06; // 离开格挡，落在台面中前
      shelf.position.set(shelfX, surfY, cornerZ);
      this.scene.add(shelf);
      const blackBoxSizes = [
        [0.2, 0.15, 0.12],
        [0.18, 0.14, 0.11],
        [0.22, 0.16, 0.13],
        [0.17, 0.13, 0.1],
      ];
      const boxBaseX = shelfX - shelfSize / 2 - 0.06;
      for (let i = 0; i < blackBoxSizes.length; i++) {
        const [bw, bd, bh] = blackBoxSizes[i];
        const bbox = this.makeMediumBlackDeskBox(bw, bd, bh, i * 3);
        const col = i % 2;
        const row = (i / 2) | 0;
        bbox.position.set(
          boxBaseX - col * 0.22 - bw * 0.15,
          surfY,
          cornerZ - 0.04 + row * 0.16
        );
        bbox.rotation.y = (col - 0.5) * 0.12 + row * 0.05;
        this.scene.add(bbox);
      }

      const clipLamp = this.makeClipTaskLight();
      clipLamp.position.set(deskNearX + 0.2, 1.48, sideScreenZ - 0.04);
      this.scene.add(clipLamp);

      // 木板+成品画：靠在格挡朝墙外侧（+Z），上缘贴外皮、不穿模；板叠整齐、画并排不叠
      const latticeT = 0.045;
      const latticeOuterZ = sideScreenZ + latticeT / 2;
      const lean = 0.11; // 统一靠角，略小以免顶缘扎进横档
      const clear = 0.012; // 与格挡外皮间隙
      // 上缘靠格挡：cz = outer + clear + (h/2)sinθ + (t/2)cosθ
      const leanCenterZ = (h, t) =>
        latticeOuterZ + clear + (h / 2) * Math.sin(lean) + (t / 2) * Math.cos(lean);

      const plankLite = this.mat(0xd4c6a8, null, { roughness: 0.82, metalness: 0.02 });
      const plankWarm = this.mat(0xc8b890, null, { roughness: 0.8, metalness: 0.02 });
      const plankN = 7;
      const plankT = 0.026;
      const plankW = 0.5;
      const plankH0 = screenH - 0.22;
      const plankPitch = plankT + 0.004; // 沿深度叠，几乎不横向重叠
      const plankStackX = deskX - deskLen * 0.22;
      let plankMaxZ = latticeOuterZ;
      for (let i = 0; i < plankN; i++) {
        const h = plankH0 - i * 0.018;
        const board = new THREE.Mesh(
          new THREE.BoxGeometry(plankW, h, plankT),
          i % 2 ? plankLite : plankWarm
        );
        const cz = leanCenterZ(h, plankT) + i * plankPitch;
        board.position.set(plankStackX, (h / 2) * Math.cos(lean) + 0.01, cz);
        board.rotation.x = -lean;
        this.scene.add(board);
        plankMaxZ = Math.max(plankMaxZ, cz + plankT);
      }

      const paintKinds = ["land", "buddha", "land"];
      const pw = 0.48;
      const ph = pw * 1.08;
      const paintT = 0.038;
      const paintGap = 0.06; // 画与画之间留缝，避免穿插
      const paintStartX = plankStackX + plankW / 2 + pw / 2 + 0.1;
      let paintMaxZ = latticeOuterZ;
      for (let i = 0; i < 3; i++) {
        const panel = this.makeLeanFinishedPainting(pw, ph, paintKinds[i]);
        const cz = leanCenterZ(ph, paintT) + i * 0.01; // 轻微前后错开防闪烁
        panel.position.set(
          paintStartX + i * (pw + paintGap),
          (ph / 2) * Math.cos(lean) + 0.02,
          cz
        );
        panel.rotation.order = "YXZ";
        panel.rotation.y = 0; // 画面朝墙（+Z）
        panel.rotation.x = -lean;
        this.scene.add(panel);
        paintMaxZ = Math.max(paintMaxZ, cz + paintT);
      }

      this.colliders.push({
        minX: deskX - deskLen / 2,
        maxX: deskX + deskLen / 2,
        minZ: sideScreenZ - latticeT / 2,
        maxZ: sideScreenZ + latticeT / 2,
      });
      this.colliders.push({
        minX: wingX - latticeT / 2,
        maxX: wingX + latticeT / 2,
        minZ: sideScreenZ - wingLen,
        maxZ: sideScreenZ,
      });
      this.colliders.push({
        minX: deskX - deskLen / 2,
        maxX: deskX + deskLen / 2,
        minZ: deskZ - deskWid / 2,
        maxZ: deskZ + deskWid / 2,
      });
      // 木板/画薄碰撞，不封死靠墙通道
      this.colliders.push({
        minX: plankStackX - plankW / 2 - 0.04,
        maxX: paintStartX + 2 * (pw + paintGap) + pw / 2 + 0.04,
        minZ: latticeOuterZ,
        maxZ: Math.max(plankMaxZ, paintMaxZ) + 0.04,
      });
    }

    makeLeanFinishedPainting(w, h, kind = "land") {
      // 靠放成品画：无底座，正面贴画
      const g = new THREE.Group();
      const wood = this.mat(0xcfc4a8, null, { roughness: 0.78, metalness: 0.03 });
      const map =
        kind === "buddha" ? this.makeBuddhaArtTexture() : this.makeLandscapeArtTexture();
      const face = new THREE.MeshStandardMaterial({ map, roughness: 0.75, metalness: 0.03 });
      const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.038), [
        wood,
        wood,
        wood,
        wood,
        face,
        wood,
      ]);
      g.add(board);
      return g;
    }

    makeWorkshopBrushRack() {
      // 对照实拍：双木杆横架 + 黑铁三脚 + 垂挂圆头大毛刷 + 黄穗/白绳
      const g = new THREE.Group();
      const iron = this.mat(0x1c1c1e, null, { roughness: 0.42, metalness: 0.58 });
      const ironSoft = this.mat(0x2c2c30, null, { roughness: 0.5, metalness: 0.45 });
      const wood = this.mat(0xd8c4a0, null, { roughness: 0.72, metalness: 0.03 });
      const woodLite = this.mat(0xe8d8b8, null, { roughness: 0.68 });
      const bristleDark = this.mat(0x2a2a2c, null, { roughness: 0.92 });
      const bristleMid = this.mat(0x6a6864, null, { roughness: 0.9 });
      const bristleLite = this.mat(0xe8e4dc, null, { roughness: 0.9 });
      const greenBand = this.mat(0x3a6a3a, null, { roughness: 0.55, metalness: 0.08 });
      const yellow = this.mat(0xe8a828, null, { roughness: 0.62 });
      const cord = this.mat(0xf2f0ea, null, { roughness: 0.82 });
      const orange = this.mat(0xe86818, null, { roughness: 0.65 });

      const poleLen = 0.52;
      const poleY = 0.42;
      const poleGap = 0.055;
      for (const dz of [-poleGap / 2, poleGap / 2]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, poleLen, 10), wood);
        pole.rotation.z = Math.PI / 2;
        pole.position.set(0, poleY, dz);
        g.add(pole);
      }
      for (const sx of [-0.18, 0, 0.18]) {
        const brace = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.014, poleGap + 0.02), woodLite);
        brace.position.set(sx, poleY, 0);
        g.add(brace);
      }

      // 两端黑铁三脚支撑
      for (const sx of [-0.2, 0.2]) {
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.02, 10), iron);
        hub.position.set(sx, 0.012, 0);
        g.add(hub);
        const upright = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, poleY - 0.02, 8), iron);
        upright.position.set(sx, poleY / 2, 0);
        g.add(upright);
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + (sx > 0 ? 0.3 : 0.8);
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.18, 6), ironSoft);
          leg.position.set(sx + Math.cos(a) * 0.05, 0.07, Math.sin(a) * 0.05);
          leg.rotation.z = Math.cos(a) * 0.5;
          leg.rotation.x = -Math.sin(a) * 0.5;
          g.add(leg);
          const foot = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 8), iron);
          foot.position.set(sx + Math.cos(a) * 0.1, 0.008, Math.sin(a) * 0.1);
          g.add(foot);
        }
      }

      // 圆头大毛刷（黑→白渐变毛，绿箍）
      const brush = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.07, 10), wood);
      handle.position.y = 0.28;
      brush.add(handle);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.052, 0.035, 16), greenBand);
      band.position.y = 0.23;
      brush.add(band);
      for (const [r, h, y, m] of [
        [0.095, 0.12, 0.14, bristleDark],
        [0.08, 0.11, 0.08, bristleMid],
        [0.055, 0.1, 0.02, bristleLite],
        [0.03, 0.07, -0.04, bristleLite],
      ]) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 16), m);
        cone.position.y = y;
        brush.add(cone);
      }
      const hang = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, 6, 10), cord);
      hang.position.y = 0.33;
      brush.add(hang);
      brush.position.set(0.02, 0.12, 0);
      g.add(brush);

      // 顶杆黄布卷 + 白绳
      const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.1, 10), yellow);
      cloth.rotation.z = Math.PI / 2;
      cloth.position.set(-0.08, poleY + 0.02, 0);
      g.add(cloth);
      const rope = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 6, 14), cord);
      rope.rotation.x = Math.PI / 2;
      rope.position.set(0.1, poleY + 0.015, 0);
      g.add(rope);

      // 右端橙黄流苏
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 8), cord);
      bead.position.set(0.24, poleY - 0.02, 0);
      g.add(bead);
      for (let i = 0; i < 6; i++) {
        const strand = new THREE.Mesh(
          new THREE.CylinderGeometry(0.003, 0.002, 0.1 + (i % 3) * 0.02, 5),
          orange
        );
        strand.position.set(0.24 + (i - 2.5) * 0.006, poleY - 0.09, 0);
        strand.rotation.z = (i - 2.5) * 0.06;
        g.add(strand);
      }
      return g;
    }

    makeDeskPaperStack() {
      const g = new THREE.Group();
      const paper = this.mat(0xf2efe6, null, { roughness: 0.9 });
      for (let i = 0; i < 5; i++) {
        const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.12 - i * 0.004, 0.006, 0.1 - i * 0.003), paper);
        sheet.position.set((i % 2) * 0.004, 0.003 + i * 0.006, (i % 3) * 0.002);
        sheet.rotation.y = (i - 2) * 0.03;
        g.add(sheet);
      }
      return g;
    }

    makeDeskToolScatter() {
      const g = new THREE.Group();
      const wood = this.mat(0xb89060, null, { roughness: 0.75 });
      const metal = this.mat(0x8a9096, null, { roughness: 0.35, metalness: 0.65 });
      const dark = this.mat(0x3a3028, null, { roughness: 0.7 });
      const red = this.mat(0xa03028, null, { roughness: 0.55 });
      for (let i = 0; i < 7; i++) {
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.08, 6), wood);
        handle.rotation.z = Math.PI / 2 + (i - 3) * 0.12;
        handle.position.set((i - 3) * 0.035, 0.01, (i % 3) * 0.02 - 0.02);
        g.add(handle);
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.004, 0.01), metal);
        tip.position.set((i - 3) * 0.035 + 0.05, 0.01, (i % 3) * 0.02 - 0.02);
        tip.rotation.y = (i - 3) * 0.1;
        g.add(tip);
      }
      for (let i = 0; i < 4; i++) {
        const scrap = new THREE.Mesh(
          new THREE.BoxGeometry(0.04 + (i % 2) * 0.02, 0.004, 0.03),
          i % 2 ? dark : this.mat(0xc8b898, null, { roughness: 0.85 })
        );
        scrap.position.set(-0.05 + i * 0.04, 0.004, 0.06 + (i % 2) * 0.02);
        scrap.rotation.y = i * 0.4;
        g.add(scrap);
      }
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.02, 12), dark);
      bowl.position.set(0.08, 0.012, -0.04);
      g.add(bowl);
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 10), red);
      bead.position.set(0.12, 0.014, 0.02);
      g.add(bead);
      return g;
    }

    makeBronzeThermos() {
      const g = new THREE.Group();
      const body = this.mat(0x4a3428, null, { roughness: 0.4, metalness: 0.35 });
      const metal = this.mat(0x8a7868, null, { roughness: 0.3, metalness: 0.55 });
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.28, 16), body);
      cup.position.y = 0.14;
      g.add(cup);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.03, 16), metal);
      band.position.y = 0.22;
      g.add(band);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.05, 14), body);
      lid.position.y = 0.305;
      g.add(lid);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 10), metal);
      knob.position.y = 0.34;
      g.add(knob);
      return g;
    }

    makeDeskGaugeClock() {
      const g = new THREE.Group();
      const chrome = this.mat(0xc8ccd0, null, { roughness: 0.28, metalness: 0.7 });
      const face = this.mat(0xf0f0ec, null, { roughness: 0.55 });
      const dark = this.mat(0x2a2a2c, null, { roughness: 0.5 });
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.006, 8, 24), chrome);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.04;
      g.add(rim);
      const dial = new THREE.Mesh(new THREE.CircleGeometry(0.035, 24), face);
      dial.rotation.x = -Math.PI / 2;
      dial.position.y = 0.042;
      g.add(dial);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.008, 10), dark);
      hub.position.y = 0.046;
      g.add(hub);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.02, 14), chrome);
      base.position.y = 0.01;
      g.add(base);
      return g;
    }

    makeSealStoneTray() {
      const g = new THREE.Group();
      const trayMat = this.mat(0x5a4030, null, { roughness: 0.75 });
      const stone = this.mat(0xc8b8a0, null, { roughness: 0.7 });
      const tray = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.14), trayMat);
      tray.position.y = 0.01;
      g.add(tray);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.018, 0.015), trayMat);
      lip.position.set(0, 0.02, 0.065);
      g.add(lip);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 5; c++) {
          const block = new THREE.Mesh(
            new THREE.BoxGeometry(0.028, 0.022 + (c % 3) * 0.006, 0.028),
            stone
          );
          block.position.set(-0.08 + c * 0.04, 0.03, -0.04 + r * 0.04);
          g.add(block);
        }
      }
      return g;
    }

    makeSpiderPlantPot() {
      // 吊兰：红陶盆 + 拱形细长叶
      const g = new THREE.Group();
      const potMat = this.mat(0x8a4a32, null, { roughness: 0.72, metalness: 0.04 });
      const leafMat = this.mat(0x3d8a3a, null, { roughness: 0.7, side: THREE.DoubleSide });
      const tipMat = this.mat(0xd8d8c8, null, { roughness: 0.75, side: THREE.DoubleSide });
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 14), potMat);
      pot.position.y = 0.06;
      g.add(pot);
      const soil = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 0.015, 12),
        this.mat(0x3a2818, null, { roughness: 0.95 })
      );
      soil.position.y = 0.12;
      g.add(soil);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.26, 0.003), i % 4 === 0 ? tipMat : leafMat);
        const bend = 0.55 + (i % 3) * 0.08;
        leaf.position.set(Math.cos(a) * 0.03, 0.22, Math.sin(a) * 0.03);
        leaf.rotation.z = Math.cos(a) * bend;
        leaf.rotation.x = Math.sin(a) * bend;
        g.add(leaf);
      }
      return g;
    }

    makeBroadLeafPlantPot() {
      const g = new THREE.Group();
      const potMat = this.mat(0x7a4030, null, { roughness: 0.7 });
      const leafMat = this.mat(0x2f6a2f, null, { roughness: 0.65, side: THREE.DoubleSide });
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.1, 12), potMat);
      pot.position.y = 0.05;
      g.add(pot);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), leafMat);
        leaf.scale.set(0.55, 1.1, 0.25);
        leaf.position.set(Math.cos(a) * 0.025, 0.14 + (i % 2) * 0.03, Math.sin(a) * 0.025);
        leaf.rotation.z = Math.cos(a) * 0.4;
        leaf.rotation.x = Math.sin(a) * 0.35;
        g.add(leaf);
      }
      return g;
    }

    makeGreenMetalToolBox() {
      const g = new THREE.Group();
      const green = this.mat(0x2a3a28, null, { roughness: 0.55, metalness: 0.25 });
      const dark = this.mat(0x1a2418, null, { roughness: 0.5, metalness: 0.3 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.13), green);
      box.position.y = 0.055;
      g.add(box);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.182, 0.02, 0.132), dark);
      lid.position.y = 0.12;
      g.add(lid);
      const latch = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.02), this.mat(0x8a9090, null, { metalness: 0.6, roughness: 0.35 }));
      latch.position.set(0, 0.1, 0.07);
      g.add(latch);
      return g;
    }

    makeClipTaskLight() {
      const g = new THREE.Group();
      const black = this.mat(0x2a2a2c, null, { roughness: 0.45, metalness: 0.35 });
      const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.05), black);
      g.add(clamp);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 8), black);
      arm.position.set(0.08, -0.02, 0.06);
      arm.rotation.z = -0.9;
      arm.rotation.x = 0.35;
      g.add(arm);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.05, 12, 1, true), black);
      head.position.set(0.16, -0.1, 0.12);
      head.rotation.x = 1.1;
      g.add(head);
      const bulb = new THREE.Mesh(
        new THREE.CircleGeometry(0.035, 16),
        this.mat(0xfff2c8, null, { roughness: 0.3, metalness: 0.05 })
      );
      bulb.position.set(0.16, -0.12, 0.135);
      bulb.rotation.x = 1.1;
      g.add(bulb);
      return g;
    }

    makeWallCertificate(w, h) {
      const g = new THREE.Group();
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 320;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#f7f4ec";
      ctx.fillRect(0, 0, 256, 320);
      ctx.strokeStyle = "#c9a24a";
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 10, 236, 300);
      ctx.fillStyle = "#2a2a2a";
      ctx.font = "bold 22px serif";
      ctx.textAlign = "center";
      ctx.fillText("荣誉证书", 128, 50);
      ctx.fillStyle = "#555";
      ctx.font = "14px serif";
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(40, 80 + i * 28, 176 - (i % 3) * 20, 6);
      }
      ctx.fillStyle = "#c02828";
      ctx.beginPath();
      ctx.arc(170, 250, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,220,180,0.35)";
      ctx.beginPath();
      ctx.arc(170, 250, 18, 0, Math.PI * 2);
      ctx.fill();
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        this.mat(0xffffff, tex, { roughness: 0.88 })
      );
      g.add(board);
      return g;
    }

    makeBlackGoldLacquerBottle() {
      // 圆润瓶身（车削轮廓）+ 琥珀盖
      const g = new THREE.Group();
      const black = this.mat(0x0e0e10, null, { roughness: 0.22, metalness: 0.35 });
      const goldMap = this.makeGoldLacquerPatternTexture();
      const gold = new THREE.MeshStandardMaterial({
        map: goldMap,
        color: 0xffffff,
        roughness: 0.32,
        metalness: 0.55,
      });
      const lip = this.mat(0xc45a28, null, { roughness: 0.45, metalness: 0.2 });

      const profile = [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(0.038, 0.01),
        new THREE.Vector2(0.052, 0.05),
        new THREE.Vector2(0.058, 0.1),
        new THREE.Vector2(0.055, 0.16),
        new THREE.Vector2(0.045, 0.22),
        new THREE.Vector2(0.03, 0.27),
        new THREE.Vector2(0.022, 0.3),
        new THREE.Vector2(0.02, 0.32),
      ];
      const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), gold);
      g.add(body);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.04, 24), black);
      neck.position.y = 0.335;
      g.add(neck);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.026, 20, 14), lip);
      cap.scale.set(1, 0.55, 1);
      cap.position.y = 0.365;
      g.add(cap);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 8, 20), black);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.352;
      g.add(rim);
      return g;
    }

    makeGoldLacquerPatternTexture() {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 512;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#0c0c0e";
      ctx.fillRect(0, 0, 512, 512);
      // 山水金纹示意
      ctx.strokeStyle = "#d4b06a";
      ctx.fillStyle = "rgba(200,160,70,0.35)";
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 8; i++) {
        const y0 = 60 + i * 55;
        ctx.beginPath();
        ctx.moveTo(20, y0);
        ctx.bezierCurveTo(80, y0 - 40, 160, y0 + 20, 240, y0 - 10);
        ctx.bezierCurveTo(320, y0 - 50, 400, y0 + 15, 490, y0);
        ctx.stroke();
      }
      for (let i = 0; i < 12; i++) {
        const x = 40 + (i * 73) % 440;
        const y = 80 + (i * 97) % 380;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 20, y - 50, x + 40, y - 10);
        ctx.quadraticCurveTo(x + 55, y + 30, x + 25, y + 45);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = "#e0c070";
      for (let i = 0; i < 50; i++) {
        ctx.beginPath();
        ctx.arc((i * 61) % 500, (i * 89) % 500, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1.5, 2);
      return tex;
    }

    makeGrassPlantPot() {
      const g = new THREE.Group();
      const potMat = this.mat(0x9a4a32, null, { roughness: 0.7, metalness: 0.05 });
      const leafMat = this.mat(0x3d7a38, null, { roughness: 0.75, side: THREE.DoubleSide });
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.048, 0.14, 14), potMat);
      pot.position.y = 0.07;
      g.add(pot);
      const soil = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12),
        this.mat(0x3a2818, null, { roughness: 0.95 })
      );
      soil.position.y = 0.14;
      g.add(soil);
      // 细长草叶向外散开
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.22, 0.004), leafMat);
        leaf.position.set(Math.cos(a) * 0.025, 0.24, Math.sin(a) * 0.025);
        leaf.rotation.z = Math.cos(a) * 0.45;
        leaf.rotation.x = Math.sin(a) * 0.45;
        g.add(leaf);
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.18, 0.003), leafMat);
        leaf.position.set(Math.cos(a) * 0.015, 0.26, Math.sin(a) * 0.015);
        leaf.rotation.z = Math.cos(a) * 0.25;
        leaf.rotation.x = Math.sin(a) * 0.25;
        g.add(leaf);
      }
      return g;
    }

    makeTexturedBlackBox() {
      const g = new THREE.Group();
      const map = this.makeBlackBoxTexture();
      const mat = new THREE.MeshStandardMaterial({
        map,
        roughness: 0.65,
        metalness: 0.12,
      });
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.12), mat);
      box.position.y = 0.05;
      g.add(box);
      // 盖缝
      const seam = new THREE.Mesh(
        new THREE.BoxGeometry(0.162, 0.006, 0.122),
        this.mat(0x1a1a1a, null, { roughness: 0.5 })
      );
      seam.position.y = 0.08;
      g.add(seam);
      return g;
    }

    makeBlackBoxTexture() {
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 128;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#1a1c1e";
      ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = "#2e3236";
      ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * 11);
        ctx.lineTo(128, i * 11 + 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i * 11, 0);
        ctx.lineTo(i * 11 - 3, 128);
        ctx.stroke();
      }
      ctx.fillStyle = "#25282c";
      for (let i = 0; i < 40; i++) {
        ctx.fillRect((i * 17) % 120, (i * 29) % 120, 4, 3);
      }
      return new THREE.CanvasTexture(c);
    }

    makeWallAirConditioner() {
      // 壁挂空调：背贴 YZ 墙、出风朝 +X；机身沿 Z；外形分层清晰
      const g = new THREE.Group();
      const white = this.mat(0xf7f7f5, null, { roughness: 0.36, metalness: 0.06 });
      const whiteSoft = this.mat(0xecece8, null, { roughness: 0.48, metalness: 0.04 });
      const grey = this.mat(0xb8b8b4, null, { roughness: 0.5, metalness: 0.08 });
      const dark = this.mat(0x1e1e20, null, { roughness: 0.55, metalness: 0.12 });
      const silver = this.mat(0xd8d8d4, null, { roughness: 0.35, metalness: 0.35 });
      const led = this.mat(0x5eb8f0, null, { roughness: 0.25, metalness: 0.15 });

      const W = 0.92; // 沿 Z，略窄于楣板以免贴柱
      const H = 0.26;
      const D = 0.2;

      // 背板贴墙（x≈0）
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.025, H * 0.92, W * 0.96), grey);
      back.position.set(0.012, 0, 0);
      g.add(back);

      // 主机白壳
      const body = new THREE.Mesh(new THREE.BoxGeometry(D * 0.85, H, W * 0.98), white);
      body.position.set(0.025 + D * 0.425, 0, 0);
      g.add(body);

      // 顶面斜切感（薄盖）
      const lid = new THREE.Mesh(new THREE.BoxGeometry(D * 0.78, 0.018, W * 0.94), whiteSoft);
      lid.position.set(0.04 + D * 0.38, H / 2 - 0.002, 0);
      g.add(lid);

      // 左右侧板（略收）
      for (const sz of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(D * 0.7, H * 0.92, 0.03), whiteSoft);
        side.position.set(0.04 + D * 0.35, 0, sz * (W / 2 - 0.02));
        g.add(side);
      }

      // 前脸：上半进风面板
      const faceTop = new THREE.Mesh(new THREE.BoxGeometry(0.02, H * 0.48, W * 0.88), white);
      faceTop.position.set(0.025 + D * 0.85, H * 0.14, 0);
      g.add(faceTop);
      // 进风格栅（细横条，层次清楚）
      for (let i = 0; i < 10; i++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, W * 0.8), grey);
        slat.position.set(0.04 + D * 0.88, H * 0.28 - i * 0.022, 0);
        g.add(slat);
      }

      // 中部分割装饰条
      const divider = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.012, W * 0.9), silver);
      divider.position.set(0.04 + D * 0.88, -H * 0.02, 0);
      g.add(divider);

      // 下半出风口
      const ventBox = new THREE.Mesh(new THREE.BoxGeometry(0.035, H * 0.32, W * 0.86), dark);
      ventBox.position.set(0.03 + D * 0.86, -H * 0.28, 0);
      g.add(ventBox);
      // 导风板（一片大叶片 + 细缝）
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, W * 0.8), whiteSoft);
      flap.position.set(0.06 + D * 0.9, -H * 0.22, 0);
      flap.rotation.z = -0.4;
      g.add(flap);
      for (let i = 0; i < 4; i++) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.006, W * 0.78), grey);
        line.position.set(0.05 + D * 0.88, -H * 0.3 - i * 0.022, 0);
        g.add(line);
      }

      // 状态灯 + 品牌小牌
      const badge = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.04, 0.1), silver);
      badge.position.set(0.05 + D * 0.9, H * 0.05, W * 0.28);
      g.add(badge);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.08), led);
      lamp.position.set(0.052 + D * 0.9, -H * 0.05, W * 0.28);
      g.add(lamp);

      // 底缘收口
      const chin = new THREE.Mesh(new THREE.BoxGeometry(D * 0.55, 0.02, W * 0.9), whiteSoft);
      chin.position.set(0.05 + D * 0.28, -H / 2 + 0.01, 0);
      g.add(chin);

      return g;
    }

    makeDarkWorkDesk(tw, td) {
      // tw=沿 X，td=沿 Z；对照实拍：深褐旧木台面
      const g = new THREE.Group();
      const woodMap = this.makeWeatheredDeskWoodTexture();
      const topMat = new THREE.MeshStandardMaterial({
        map: woodMap,
        roughness: 0.78,
        metalness: 0.04,
      });
      const legMat = this.mat(0x3a2a22, null, { roughness: 0.7, metalness: 0.08 });
      const topY = 0.75;
      const top = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.06, td), topMat);
      top.position.y = topY;
      g.add(top);
      // 厚桌沿
      const apron = new THREE.Mesh(
        new THREE.BoxGeometry(tw * 0.98, 0.05, td * 0.98),
        this.mat(0x2e221a, null, { roughness: 0.75 })
      );
      apron.position.y = topY - 0.05;
      g.add(apron);
      for (const [lx, lz] of [
        [-tw / 2 + 0.08, -td / 2 + 0.08],
        [tw / 2 - 0.08, -td / 2 + 0.08],
        [-tw / 2 + 0.08, td / 2 - 0.08],
        [tw / 2 - 0.08, td / 2 - 0.08],
      ]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, topY - 0.04, 0.06), legMat);
        leg.position.set(lx, (topY - 0.04) / 2, lz);
        g.add(leg);
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.85, 0.04, 0.04), legMat);
      rail.position.set(0, 0.28, 0);
      g.add(rail);
      return g;
    }

    makeWeatheredDeskWoodTexture() {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 256;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#3a2a20";
      ctx.fillRect(0, 0, 512, 256);
      for (let i = 0; i < 40; i++) {
        ctx.strokeStyle = `rgba(${40 + (i % 5) * 8},${28 + (i % 4) * 6},${18 + (i % 3) * 4},0.35)`;
        ctx.lineWidth = 1 + (i % 3);
        ctx.beginPath();
        ctx.moveTo(0, i * 7);
        ctx.bezierCurveTo(120, i * 7 + 4, 280, i * 7 - 3, 512, i * 7 + 2);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(20,14,10,0.25)";
      for (let i = 0; i < 60; i++) {
        ctx.fillRect((i * 47) % 500, (i * 31) % 240, 8 + (i % 5), 2);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(3, 1);
      return tex;
    }

    makeWoodStool(seatW = 0.38) {
      const g = new THREE.Group();
      const wood = this.mat(0x9a7848, null, { roughness: 0.75 });
      const woodDark = this.mat(0x6a4e30, null, { roughness: 0.8 });
      const seatY = 0.42;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(seatW, 0.04, seatW * 0.85), wood);
      seat.position.y = seatY;
      g.add(seat);
      const legT = 0.035;
      for (const [lx, lz] of [
        [-seatW * 0.35, -seatW * 0.3],
        [seatW * 0.35, -seatW * 0.3],
        [-seatW * 0.35, seatW * 0.3],
        [seatW * 0.35, seatW * 0.3],
      ]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(legT, seatY - 0.02, legT), woodDark);
        leg.position.set(lx, (seatY - 0.02) / 2, lz);
        g.add(leg);
      }
      return g;
    }

    makeUnderDeskShelf(w, d, h) {
      const g = new THREE.Group();
      const wood = this.mat(0x6a3028, null, { roughness: 0.7, metalness: 0.05 });
      for (const y of [0.08, h * 0.45, h * 0.85]) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, d), wood);
        plank.position.y = y;
        g.add(plank);
      }
      for (const [sx, sz] of [
        [-w / 2 + 0.03, -d / 2 + 0.03],
        [w / 2 - 0.03, -d / 2 + 0.03],
        [-w / 2 + 0.03, d / 2 - 0.03],
        [w / 2 - 0.03, d / 2 - 0.03],
      ]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.035, h, 0.035), wood);
        post.position.set(sx, h / 2, sz);
        g.add(post);
      }
      // 架上几只小瓶
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.028, 0.1, 8),
          this.mat([0xc8c0b0, 0x2a4a6a, 0x8a3020][i], null, { roughness: 0.5 })
        );
        b.position.set(-0.12 + i * 0.12, h * 0.85 + 0.06, 0);
        g.add(b);
      }
      return g;
    }

    makeFourTierSquareShelf(size = 0.3, h = 0.46) {
      // 桌面四层方形木架
      const g = new THREE.Group();
      const wood = this.mat(0x8a6848, null, { roughness: 0.72, metalness: 0.04 });
      const woodDark = this.mat(0x5c402c, null, { roughness: 0.68, metalness: 0.05 });
      const t = 0.018;
      for (let i = 0; i < 4; i++) {
        const y = t / 2 + (i / 3) * (h - t);
        const plank = new THREE.Mesh(new THREE.BoxGeometry(size, t, size), i % 2 ? wood : woodDark);
        plank.position.y = y;
        g.add(plank);
      }
      const inset = 0.02;
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.026, h, 0.026), woodDark);
        post.position.set(sx * (size / 2 - inset), h / 2, sz * (size / 2 - inset));
        g.add(post);
      }
      // 顶层小件示意
      for (let i = 0; i < 2; i++) {
        const cup = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.032, 0.06, 8),
          this.mat(i ? 0xc4b090 : 0x3a5a4a, null, { roughness: 0.55 })
        );
        cup.position.set(-0.06 + i * 0.12, h + 0.03, 0.02);
        g.add(cup);
      }
      return g;
    }

    makeMediumBlackDeskBox(w = 0.2, d = 0.15, h = 0.12, seed = 0) {
      // 中型黑匣：哑光黑漆 + 细盖缝
      const g = new THREE.Group();
      const map = this.makeBlackBoxTexture();
      map.offset.set((seed % 5) * 0.07, (seed % 3) * 0.05);
      const mat = new THREE.MeshStandardMaterial({
        map,
        roughness: 0.55,
        metalness: 0.18,
      });
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      body.position.y = h / 2;
      g.add(body);
      const seam = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.98, 0.006, d * 0.98),
        this.mat(0x0e0e10, null, { roughness: 0.45, metalness: 0.25 })
      );
      seam.position.y = h * 0.72;
      g.add(seam);
      const lid = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.96, 0.012, d * 0.96),
        this.mat(0x1a1a1c, null, { roughness: 0.4, metalness: 0.22 })
      );
      lid.position.y = h;
      g.add(lid);
      return g;
    }

    makeModelIntroPoster(w, h) {
      // 对照实拍：银框立牌 + 绿色「模型简介」标题 + 人像区
      const g = new THREE.Group();
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = 440;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#f7f5ef";
      ctx.fillRect(0, 0, 320, 440);
      ctx.fillStyle = "#2e7a3a";
      ctx.font = "bold 36px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("模型简介", 160, 48);
      ctx.fillStyle = "#5a5a5a";
      ctx.fillRect(90, 70, 140, 170);
      ctx.fillStyle = "#c4a882";
      ctx.beginPath();
      ctx.arc(160, 130, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a3028";
      ctx.fillRect(130, 165, 60, 55);
      ctx.fillStyle = "#444";
      for (let i = 0; i < 7; i++) {
        ctx.fillRect(36, 260 + i * 22, 248 - (i % 4) * 18, 7);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        this.mat(0xffffff, tex, { roughness: 0.82 })
      );
      board.position.z = 0.008;
      g.add(board);
      const frame = this.mat(0xb8bcc0, null, { roughness: 0.35, metalness: 0.55 });
      const t = 0.018;
      for (const [fw, fh, fx, fy] of [
        [w + t * 2, t, 0, h / 2 + t / 2],
        [w + t * 2, t, 0, -h / 2 - t / 2],
        [t, h, -w / 2 - t / 2, 0],
        [t, h, w / 2 + t / 2, 0],
      ]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.02), frame);
        bar.position.set(fx, fy, 0);
        g.add(bar);
      }
      // 桌面小底座
      const stand = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.55, 0.02, 0.06),
        this.mat(0x4a4a4c, null, { roughness: 0.5, metalness: 0.3 })
      );
      stand.position.set(0, -h / 2 - 0.01, 0.02);
      g.add(stand);
      return g;
    }

    addPaintBoothNextToCabinet(cabX, cabZ, cabFaceW, cabSideD, cabH) {
      // 柜门朝 -X；右侧侧面为 +Z。格挡贴侧面，并在柜门一侧转角伸出
      const iron = this.mat(0x6a7076, null, { metalness: 0.55, roughness: 0.42 });
      const ironDark = this.mat(0x4a5056, null, { metalness: 0.5, roughness: 0.5 });
      const frontX = cabX - cabSideD / 2; // 柜门所在面
      const sideZ = cabZ + cabFaceW / 2; // 柜右侧面
      const screenH = Math.min(cabH - 0.05, 2.15);
      const sideLen = cabSideD; // 贴侧面一段（长边）
      const wingLen = sideLen / 6; // 转角翼仅为侧面的 1/6
      const wingX = frontX - 0.06;
      const sideScreenZ = sideZ + 0.05;

      // 贴柜侧面：板面法线 ±Z，长边沿 X
      const sideScreen = this.makeIronLatticeScreen(sideLen, screenH, iron, ironDark, true);
      sideScreen.position.set(cabX, 0, sideScreenZ);
      this.scene.add(sideScreen);

      // 柜门一侧短转角翼：平行柜门，长边沿 +Z
      const wing = this.makeIronLatticeScreen(wingLen, screenH, iron, ironDark, false);
      wing.rotation.y = Math.PI / 2;
      wing.position.set(wingX, 0, sideScreenZ + wingLen / 2);
      this.scene.add(wing);

      // 转角立柱
      const corner = new THREE.Mesh(new THREE.BoxGeometry(0.07, screenH, 0.07), ironDark);
      corner.position.set(wingX, screenH / 2, sideScreenZ);
      this.scene.add(corner);

      // 桌：长铺满侧面格挡，宽 = 转角翼长度 × 2；椅：黑色方形交椅
      const deskLen = sideLen; // 沿格挡长边（X）
      const deskWid = wingLen * 2; // 垂直格挡伸出
      const desk = this.makePaintWorkDesk(deskLen, deskWid, false);
      const deskX = cabX;
      const deskZ = sideScreenZ + deskWid / 2 + 0.04;
      desk.position.set(deskX, 0, deskZ);
      this.scene.add(desk);

      const surfY = 0.75 + 0.025;
      // 对照高清：左中大件——黄底白盒摞 ∥ 蓝漆盒，蓝盒上两亮黑瓦罐（约占桌宽一半）；细碎忽略
      const boxD = deskWid * 0.46;
      const yelW = boxD * 0.95;
      const yelD = boxD;
      const yelH = 0.13;
      const blueW = boxD * 1.12;
      const blueD = boxD * 1.02;
      const blueH = 0.16;
      // 靠格挡拐角一侧（-X）、桌面中后段
      const yelX = deskX - deskLen * 0.22;
      const packZ = deskZ - deskWid * 0.02;
      const blueX = yelX + yelW * 0.52 + blueW * 0.52 + 0.02;

      const yelStack = this.makeYellowBandBoxStack(2, yelW, yelD, yelH);
      yelStack.position.set(yelX, surfY, packZ);
      this.scene.add(yelStack);

      const blueBox = this.makeBlueLacquerDeskBox(blueW, blueD, blueH);
      blueBox.position.set(blueX, surfY, packZ);
      this.scene.add(blueBox);

      // 蓝盒上亮黑瓦罐（保持原比例）
      const jarScale = blueW * 0.45;
      const jarGap = blueW * 0.48;
      for (let i = 0; i < 2; i++) {
        const jar = this.makeShinyBlackJar(jarScale);
        jar.position.set(blueX - jarGap / 2 + i * jarGap, surfY + blueH, packZ);
        this.scene.add(jar);
      }

      const card = this.makeSmallDeskPhotoCard(0.11, 0.15);
      card.position.set(yelX, surfY + yelH * 2 + 0.08, packZ - yelD * 0.22);
      this.scene.add(card);

      // 右侧大件：黑色摇臂台灯
      const lamp = this.makeBlackSwingArmLamp();
      const lampX = deskX + deskLen * 0.08;
      const lampZ = deskZ + deskWid * 0.08;
      lamp.position.set(lampX, 0.75, lampZ);
      lamp.rotation.y = -0.9;
      this.scene.add(lamp);
      lamp.updateMatrixWorld(true);
      if (lamp.userData.head) {
        lamp.userData.head.lookAt(new THREE.Vector3(blueX, surfY + 0.2, packZ));
      }

      // 靠里侧两高黑瓶：加粗显眼；盆栽一并加大
      const backPropZ = deskZ - deskWid * 0.28;
      for (let i = 0; i < 2; i++) {
        const vase = this.makeTallMatteBlackVase();
        vase.scale.set(2.55, 2.35, 2.55);
        vase.position.set(deskX + deskLen * 0.1 + i * 0.2, surfY, backPropZ);
        this.scene.add(vase);
      }
      const plant = this.makeSpiderPlantPot();
      plant.scale.setScalar(1.5);
      plant.position.set(deskX + deskLen * 0.26, surfY, backPropZ + 0.06);
      this.scene.add(plant);

      // 格挡左立柱小国旗
      const flag = this.makeMiniChinaFlag(0.1, 0.07);
      flag.position.set(wingX + 0.02, 1.35, sideScreenZ + wingLen * 0.45);
      this.scene.add(flag);

      const chairW = deskLen / 4; // 椅宽约占桌长 1/4
      const chair = this.makeBlackSquareArmchair(chairW);
      // 放在桌前外侧，避免与桌面穿模
      chair.position.set(deskX - deskLen * 0.2, 0, deskZ + deskWid * 0.55 + chairW * 0.55);
      chair.rotation.y = Math.PI; // 面朝桌子
      this.scene.add(chair);

      this.colliders.push({
        minX: Math.min(wingX, cabX - deskLen / 2) - 0.1,
        maxX: cabX + cabSideD / 2,
        minZ: sideZ - 0.05,
        maxZ: sideScreenZ + Math.max(wingLen, deskWid) + 0.15,
      });
    }

    makeYellowBandBoxStack(n, w, d, h) {
      // 对照实拍：灰白盒身 + 底部粗黄条；盖缝/压线
      const g = new THREE.Group();
      const paperMap = this.makeBoxPaperTexture(0xd8d4c8, 0xc8c2b4);
      const body = new THREE.MeshStandardMaterial({
        map: paperMap,
        roughness: 0.78,
        metalness: 0.04,
      });
      const band = this.mat(0xe8b820, null, { roughness: 0.48, metalness: 0.12 });
      const edge = this.mat(0xb0aca0, null, { roughness: 0.62 });
      const seamMat = this.mat(0xa8a498, null, { roughness: 0.7 });
      for (let i = 0; i < n; i++) {
        const bw = w - i * 0.01;
        const bd = d - i * 0.008;
        const y0 = i * h;
        const box = new THREE.Mesh(new THREE.BoxGeometry(bw, h * 0.92, bd), body);
        box.position.y = y0 + h * 0.46;
        g.add(box);
        // 黄条在底部约 1/3
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.003, h * 0.3, bd + 0.003), band);
        stripe.position.y = y0 + h * 0.18;
        g.add(stripe);
        // 盖板略外挑 + 盖缝
        const lid = new THREE.Mesh(new THREE.BoxGeometry(bw * 1.02, 0.014, bd * 1.02), edge);
        lid.position.y = y0 + h - 0.005;
        g.add(lid);
        const seam = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.97, 0.005, bd * 0.97), seamMat);
        seam.position.y = y0 + h * 0.78;
        g.add(seam);
        // 顶面浅压线框
        const inset = new THREE.Mesh(
          new THREE.BoxGeometry(bw * 0.88, 0.002, bd * 0.88),
          this.mat(0xcac6ba, null, { roughness: 0.7 })
        );
        inset.position.y = y0 + h + 0.003;
        g.add(inset);
      }
      return g;
    }

    makeBlueLacquerDeskBox(w, d, h) {
      // 深蓝漆盒：高光漆面、盖沿、暗缝、顶面细框
      const g = new THREE.Group();
      const lacMap = this.makeBoxPaperTexture(0x152a58, 0x1e3a6e, true);
      const blue = new THREE.MeshStandardMaterial({
        map: lacMap,
        roughness: 0.2,
        metalness: 0.45,
      });
      const blueHi = this.mat(0x2a4a88, null, { roughness: 0.16, metalness: 0.55 });
      const dark = this.mat(0x0a1838, null, { roughness: 0.35, metalness: 0.3 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.88, d), blue);
      box.position.y = h * 0.44;
      g.add(box);
      // 盖
      const lid = new THREE.Mesh(new THREE.BoxGeometry(w * 1.015, h * 0.14, d * 1.015), blueHi);
      lid.position.y = h * 0.93;
      g.add(lid);
      const lidTop = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.006, d * 0.96), blueHi);
      lidTop.position.y = h + 0.002;
      g.add(lidTop);
      // 盖缝暗线
      const seam = new THREE.Mesh(new THREE.BoxGeometry(w * 0.99, 0.008, d * 0.99), dark);
      seam.position.y = h * 0.86;
      g.add(seam);
      // 顶面内凹细框
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.82, 0.003, d * 0.82),
        this.mat(0x0e2048, null, { roughness: 0.3, metalness: 0.4 })
      );
      frame.position.y = h + 0.006;
      g.add(frame);
      // 四角微高光
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        const corner = new THREE.Mesh(
          new THREE.BoxGeometry(0.012, h * 0.7, 0.012),
          this.mat(0x1a3a70, null, { roughness: 0.18, metalness: 0.5 })
        );
        corner.position.set(sx * (w / 2 - 0.01), h * 0.4, sz * (d / 2 - 0.01));
        g.add(corner);
      }
      return g;
    }

    makeBoxPaperTexture(baseHex, grainHex, glossy = false) {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext("2d");
      ctx.fillStyle = `#${baseHex.toString(16).padStart(6, "0")}`;
      ctx.fillRect(0, 0, 256, 256);
      const gHex = `#${grainHex.toString(16).padStart(6, "0")}`;
      ctx.strokeStyle = gHex;
      ctx.globalAlpha = glossy ? 0.18 : 0.28;
      ctx.lineWidth = 1;
      for (let i = 0; i < 28; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * 10 + (i % 3));
        ctx.lineTo(256, i * 10 + 2);
        ctx.stroke();
      }
      ctx.globalAlpha = glossy ? 0.12 : 0.2;
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = gHex;
        ctx.fillRect((i * 37) % 250, (i * 53) % 250, 3 + (i % 4), 2);
      }
      if (glossy) {
        ctx.globalAlpha = 0.15;
        const grd = ctx.createLinearGradient(0, 0, 256, 256);
        grd.addColorStop(0, "rgba(255,255,255,0.35)");
        grd.addColorStop(0.5, "rgba(255,255,255,0)");
        grd.addColorStop(1, "rgba(0,0,0,0.2)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, 256, 256);
      }
      ctx.globalAlpha = 1;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2, 2);
      return tex;
    }

    makeShinyBlackJar(scale = 0.2) {
      // 对照实拍：梨形亮黑瓦罐，鼓腹、细短颈、外撇唇
      const g = new THREE.Group();
      const black = this.mat(0x050508, null, { roughness: 0.08, metalness: 0.72 });
      const s = scale;
      const profile = [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(0.22 * s, 0.015 * s),
        new THREE.Vector2(0.38 * s, 0.08 * s),
        new THREE.Vector2(0.48 * s, 0.2 * s),
        new THREE.Vector2(0.5 * s, 0.32 * s),
        new THREE.Vector2(0.42 * s, 0.44 * s),
        new THREE.Vector2(0.26 * s, 0.54 * s),
        new THREE.Vector2(0.16 * s, 0.6 * s),
        new THREE.Vector2(0.14 * s, 0.66 * s),
        new THREE.Vector2(0.2 * s, 0.7 * s),
        new THREE.Vector2(0.22 * s, 0.72 * s),
      ];
      g.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 36), black));
      return g;
    }

    makeTallMatteBlackVase() {
      // 细高哑光黑瓶，瓶身稍粗
      const g = new THREE.Group();
      const matte = this.mat(0x1a1a1c, null, { roughness: 0.72, metalness: 0.1 });
      const profile = [
        new THREE.Vector2(0.028, 0),
        new THREE.Vector2(0.052, 0.04),
        new THREE.Vector2(0.055, 0.12),
        new THREE.Vector2(0.048, 0.22),
        new THREE.Vector2(0.036, 0.3),
        new THREE.Vector2(0.03, 0.34),
        new THREE.Vector2(0.038, 0.36),
      ];
      g.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 24), matte));
      return g;
    }

    makeMiniChinaFlag(w, h) {
      const g = new THREE.Group();
      const c = document.createElement("canvas");
      c.width = 120;
      c.height = 80;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#de2910";
      ctx.fillRect(0, 0, 120, 80);
      ctx.fillStyle = "#ffde00";
      const star = (x, y, r) => {
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
          const x1 = x + Math.cos(a) * r;
          const y1 = y + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x1, y1);
          else ctx.lineTo(x1, y1);
        }
        ctx.closePath();
        ctx.fill();
      };
      star(28, 28, 12);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        this.mat(0xffffff, tex, { roughness: 0.7, side: THREE.DoubleSide })
      );
      g.add(flag);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004, 0.004, h + 0.04, 6),
        this.mat(0xc8c8c8, null, { metalness: 0.5, roughness: 0.4 })
      );
      pole.position.set(-w / 2, 0, 0);
      g.add(pole);
      return g;
    }

    makeSmallDeskPhotoCard(w, h) {
      const g = new THREE.Group();
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 160;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#f4f2ea";
      ctx.fillRect(0, 0, 128, 160);
      ctx.fillStyle = "#6a6a6a";
      ctx.fillRect(24, 20, 80, 90);
      ctx.fillStyle = "#c4a882";
      ctx.beginPath();
      ctx.arc(64, 55, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#555";
      for (let i = 0; i < 3; i++) ctx.fillRect(20, 120 + i * 10, 88 - i * 10, 5);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        this.mat(0xffffff, tex, { roughness: 0.85 })
      );
      g.add(card);
      return g;
    }

    addPaintBoothBesidePoemCabinet(
      archiveX,
      archiveZ,
      archiveFaceW,
      archiveD,
      archiveH,
      refDeskLen,
      panelPitch = 1.05
    ) {
      // 诗柜左侧（-Z）：整体朝向与上一版相反——椅在靠柜侧面朝桌子，格挡在外侧
      const iron = this.mat(0x6a7076, null, { metalness: 0.55, roughness: 0.42 });
      const ironDark = this.mat(0x4a5056, null, { metalness: 0.5, roughness: 0.5 });
      const frontX = archiveX - archiveD / 2;
      const sideZ = archiveZ - archiveFaceW / 2;
      const screenH = Math.min(archiveH - 0.05, 2.15);
      const deskLen = refDeskLen;
      const wingLen = deskLen / 6;
      const deskWid = wingLen * 2;
      const deskX = frontX - deskLen / 2;
      // 桌距诗柜约一块亚克力板
      const deskZ = sideZ - panelPitch - deskWid / 2;
      // 格挡在桌子外侧（更 -Z），短翼在走廊端
      const sideScreenZ = deskZ - deskWid / 2 - 0.06;

      const sideScreen = this.makeIronLatticeScreen(deskLen, screenH, iron, ironDark, true);
      sideScreen.position.set(deskX, 0, sideScreenZ);
      this.scene.add(sideScreen);

      const wing = this.makeIronLatticeScreen(wingLen, screenH, iron, ironDark, false);
      wing.rotation.y = Math.PI / 2;
      wing.position.set(deskX - deskLen / 2 - 0.02, 0, sideScreenZ - wingLen / 2);
      this.scene.add(wing);

      const corner = new THREE.Mesh(new THREE.BoxGeometry(0.07, screenH, 0.07), ironDark);
      corner.position.set(deskX - deskLen / 2, screenH / 2, sideScreenZ);
      this.scene.add(corner);

      const desk = this.makePaintWorkDesk(deskLen, deskWid);
      desk.position.set(deskX, 0, deskZ);
      desk.rotation.y = Math.PI; // 桌面物件朝向一并反转
      this.scene.add(desk);

      // 椅子+画架：贴桌子走廊端外侧；画架高约格挡 3/4；略留空隙防穿模
      const chairW = 0.5;
      const chair = this.makeBlackSquareArmchair(chairW);
      const chairX = deskX - deskLen * 0.4;
      const chairZ = deskZ + deskWid / 2 + chairW * 0.5 + 0.1;
      chair.position.set(chairX, 0, chairZ);
      chair.rotation.y = Math.PI / 2; // 靠背朝 -X（走廊）
      this.scene.add(chair);

      const easelH = screenH * 0.75; // 约格挡四分之三高
      const paintH = easelH * 0.82;
      const paintW = paintH / 1.7;
      const easel = this.makePainterEaselWithArt(paintW, paintH, easelH);
      // 相对椅子再往内侧挪一点，避免与椅腿穿模
      const easelX = chairX + chairW * 0.55 + 0.42;
      const easelZ = chairZ + 0.04;
      easel.position.set(easelX, 0, easelZ);
      this.scene.add(easel);

      // 黑色摇臂台灯：灯头 lookAt 画心，罩口与聚光都对准画作（不是格挡）
      const deskTopY = 0.75;
      const lamp = this.makeBlackSwingArmLamp();
      const lampX = Math.min(deskX + deskLen * 0.02, easelX - 0.75);
      const lampZ = deskZ + deskWid * 0.16;
      lamp.position.set(lampX, deskTopY, lampZ);
      // 灯臂大致朝画架所在方位
      lamp.rotation.y = Math.atan2(easelZ - lampZ, easelX - lampX);
      this.scene.add(lamp);
      const paintTarget = new THREE.Vector3(easelX, paintH * 0.55, easelZ);
      lamp.updateMatrixWorld(true);
      if (lamp.userData.head) {
        lamp.userData.head.lookAt(paintTarget);
        // lookAt 后罩口背对画作，绕 Y 再翻 180° 使碗口朝向画作
        lamp.userData.head.rotateY(Math.PI);
        lamp.updateMatrixWorld(true);
      }
      const spot = new THREE.SpotLight(0xfff2dd, 2.6, 7.5, 0.38, 0.3, 1);
      const headPos = new THREE.Vector3();
      if (lamp.userData.head) lamp.userData.head.getWorldPosition(headPos);
      else headPos.set(lampX, deskTopY + 0.9, lampZ);
      const toPaint = paintTarget.clone().sub(headPos).normalize();
      spot.position.copy(headPos).addScaledVector(toPaint, 0.12);
      const spotTarget = new THREE.Object3D();
      spotTarget.position.copy(paintTarget);
      spot.target = spotTarget;
      this.scene.add(spot);
      this.scene.add(spotTarget);

      // 桌面中央偏椅子：薄荷绿 U 形风扇朝椅吹，躲开台灯
      const fan = this.makeWhiteDesktopFan();
      const fanX = deskX - deskLen * 0.14;
      const fanZ = deskZ + deskWid * 0.18;
      fan.position.set(fanX, deskTopY, fanZ);
      fan.rotation.y = Math.atan2(chairX - fanX, chairZ - fanZ);
      this.scene.add(fan);

      // 台灯与风扇之间：画笔、美工刀、砚台（落在桌面上沿，勿埋进台面）
      const deskSurfY = deskTopY + 0.025;
      this.addPaintBoothDeskTools(
        lampX * 0.45 + fanX * 0.55,
        deskSurfY,
        lampZ * 0.4 + fanZ * 0.6
      );

      // 靠墙∩长格挡交界：纸盒 9×2、5×1、3×1（台灯不动）
      this.addDeskPortfolioBoxStacks(deskX, deskZ, deskLen, deskWid, deskTopY);

      // 桌+格挡碰撞（不含椅架，避免封死通道）
      this.colliders.push({
        minX: deskX - deskLen / 2 - wingLen - 0.08,
        maxX: deskX + deskLen / 2 + 0.05,
        minZ: sideScreenZ - wingLen - 0.1,
        maxZ: deskZ + deskWid / 2 + 0.06,
      });
      // 椅+画架小碰撞盒
      this.colliders.push({
        minX: chairX - chairW * 0.55,
        maxX: easelX + paintW * 0.35,
        minZ: Math.min(chairZ, easelZ) - chairW * 0.55,
        maxZ: Math.max(chairZ, easelZ) + chairW * 0.55,
      });

      // 工作桌靠走廊短边外侧：展桌长边∥走廊；左不过格挡、右贴桌短边外沿
      this.addPoemDeskSideDisplayTable(deskX, deskZ, deskLen, deskWid, sideScreenZ);
    }

    addPoemDeskSideDisplayTable(deskX, deskZ, deskLen, deskWid, sideScreenZ) {
      // 短边外侧（-X），长边沿 Z∥走廊；右侧(+Z)不动，左侧收到格挡以内
      const tableDeep = 1.2;
      const rightZ = deskZ + deskWid / 2; // 右侧对齐工作桌 +Z 外沿
      const leftZ = sideScreenZ + 0.06; // 左侧不超过金属格挡
      const tableLong = Math.max(1.1, rightZ - leftZ);
      const deskEndX = deskX - deskLen / 2;
      const tx = deskEndX - 0.18 - tableDeep / 2;
      const tz = (leftZ + rightZ) / 2;
      const surfY = 0.75 + 0.025;

      const table = this.makeSimpleDisplayTable(tableDeep, tableLong);
      table.position.set(tx, 0, tz);
      this.scene.add(table);

      // 外排 6 小盒铺满；内排左侧 4 小盒（两黑两红），右侧更大更高箱；佛在四盒后面
      const margin = 0.03;
      const nOuter = 6;
      const nInner = 4;
      const pitch = (tableLong - margin * 2) / nOuter;
      const smallBox = pitch * 0.98;
      const smallH = smallBox * 0.55;
      const rowOuterX = tx - tableDeep / 2 + smallBox * 0.55;
      const rowInnerX = rowOuterX + smallBox * 1.02;
      const startZ = leftZ + margin + pitch / 2; // 左侧起

      for (let i = 0; i < nOuter; i++) {
        const box = this.makeLacquerGiftBox(smallBox, smallBox * 0.95, smallH, true, i + 3);
        // giftBox 原点在几何中心，需抬起 h/2 才坐在台面
        box.position.set(rowOuterX, surfY + smallH / 2, startZ + i * pitch);
        this.scene.add(box);
      }
      for (let i = 0; i < nInner; i++) {
        const isBlack = i < 2;
        const box = isBlack
          ? this.makeBlackLacquerMiniBox(smallBox, smallBox * 0.95, smallH)
          : this.makeLacquerGiftBox(smallBox, smallBox * 0.95, smallH, true, 40 + i);
        // 黑盒原点在底面，红盒在中心
        const y = isBlack ? surfY : surfY + smallH / 2;
        box.position.set(rowInnerX, y, startZ + i * pitch);
        this.scene.add(box);
      }

      // 右侧：更大更高的漆箱（占外排第 5–6 格宽度）
      const tallW = smallBox * 1.15;
      const tallD = pitch * 1.85;
      const tallH = smallH * 3.55;
      const tallZ = startZ + 4.5 * pitch; // 右两格居中
      const tallBox = this.makeLacquerGiftBox(tallW, tallD, tallH, true, 55);
      tallBox.position.set(rowInnerX, surfY + tallH / 2, tallZ);
      this.scene.add(tallBox);

      // 金色佛像：在内侧四个小盒后面，留足底座半径避免穿模
      const buddha = this.makeGoldBuddhaStatue();
      buddha.scale.setScalar(0.7);
      const fourMidZ = startZ + 1.5 * pitch;
      const buddhaX = Math.min(rowInnerX + smallBox * 0.5 + 0.34, tx + tableDeep / 2 - 0.22);
      buddha.position.set(buddhaX, surfY, fourMidZ);
      buddha.rotation.y = Math.PI / 2;
      this.scene.add(buddha);

      this.colliders.push({
        minX: tx - tableDeep / 2,
        maxX: tx + tableDeep / 2,
        minZ: leftZ,
        maxZ: rightZ,
      });
    }

    makeSimpleDisplayTable(tw, td) {
      // 深灰展桌，对照实拍长条台面
      const g = new THREE.Group();
      const topMat = this.mat(0x3a3e44, null, { roughness: 0.55, metalness: 0.12 });
      const legMat = this.mat(0x2a2e32, null, { roughness: 0.5, metalness: 0.2 });
      const topY = 0.75;
      const top = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.045, td), topMat);
      top.position.y = topY;
      g.add(top);
      for (const [lx, lz] of [
        [-tw / 2 + 0.08, -td / 2 + 0.08],
        [tw / 2 - 0.08, -td / 2 + 0.08],
        [-tw / 2 + 0.08, td / 2 - 0.08],
        [tw / 2 - 0.08, td / 2 - 0.08],
      ]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, topY - 0.02, 0.05), legMat);
        leg.position.set(lx, (topY - 0.02) / 2, lz);
        g.add(leg);
      }
      return g;
    }

    makeBlackLacquerMiniBox(w, d, h) {
      const g = new THREE.Group();
      const black = this.mat(0x121214, null, { roughness: 0.2, metalness: 0.4 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), black);
      box.position.y = h / 2;
      g.add(box);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.01, d * 0.98), black);
      lid.position.y = h;
      g.add(lid);
      return g;
    }

    makeGoldBuddhaStatue() {
      // 对照实拍：金色坐佛，袈裟带褐灰纹
      const g = new THREE.Group();
      const gold = this.mat(0xd4b060, null, { metalness: 0.75, roughness: 0.28 });
      const goldHi = this.mat(0xe8d090, null, { metalness: 0.8, roughness: 0.22 });
      const robe = this.mat(0x6a5a40, null, { metalness: 0.35, roughness: 0.45 });
      const robeDark = this.mat(0x3a3428, null, { metalness: 0.3, roughness: 0.5 });

      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.1, 16), robeDark);
      base.position.y = 0.05;
      g.add(base);

      for (const [sx, a] of [
        [-1, 0.35],
        [1, -0.35],
      ]) {
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.15, 4, 8), robe);
        leg.rotation.z = Math.PI / 2;
        leg.rotation.y = a;
        leg.position.set(sx * 0.06, 0.26, 0.05);
        g.add(leg);
        const knee = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), robe);
        knee.position.set(sx * 0.17, 0.28, 0.07);
        g.add(knee);
      }

      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.4, 12), robe);
      torso.position.y = 0.52;
      g.add(torso);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), robeDark);
      belly.scale.set(1.1, 0.7, 0.9);
      belly.position.set(0, 0.4, 0.04);
      g.add(belly);

      // 金身头手
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.05, 10), gold);
      neck.position.y = 0.74;
      g.add(neck);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), goldHi);
      head.position.set(0, 0.88, 0.02);
      g.add(head);
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), gold);
      bun.position.set(0, 0.99, 0.01);
      g.add(bun);
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.055, 3, 6), gold);
        ear.position.set(s * 0.105, 0.86, 0.02);
        g.add(ear);
      }

      const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.16, 4, 8), gold);
      armL.rotation.z = 0.9;
      armL.position.set(-0.15, 0.5, 0.1);
      g.add(armL);
      const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.14, 4, 8), gold);
      armR.rotation.z = -0.5;
      armR.rotation.x = -0.4;
      armR.position.set(0.14, 0.55, 0.12);
      g.add(armR);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), goldHi);
      hand.position.set(0.18, 0.62, 0.16);
      g.add(hand);

      // 袈裟金纹示意
      for (let i = 0; i < 4; i++) {
        const fold = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.2 - i * 0.02, 0.015),
          gold
        );
        fold.position.set(-0.05 + i * 0.035, 0.48, 0.13);
        fold.rotation.x = 0.12;
        g.add(fold);
      }
      return g;
    }

    addPaintBoothDeskTools(cx, surfY, cz) {
      // surfY = 桌面上表面；工具放大，保证远看也能辨认
      const ink = this.makeInkStone();
      ink.position.set(cx - 0.12, surfY, cz + 0.04);
      ink.rotation.y = 0.3;
      ink.scale.setScalar(1.35);
      this.scene.add(ink);

      const brushes = [
        { len: 0.28, tip: 0x1a1a1a, ox: 0.05, oz: -0.06, ry: 0.85 },
        { len: 0.26, tip: 0x2a1810, ox: 0.1, oz: -0.02, ry: 1.0 },
        { len: 0.3, tip: 0x111111, ox: 0.16, oz: -0.07, ry: 0.7 },
        { len: 0.24, tip: 0x3a2218, ox: 0.08, oz: 0.08, ry: 1.25 },
      ];
      for (const b of brushes) {
        const brush = this.makePaintBrush(b.len, b.tip);
        brush.position.set(cx + b.ox, surfY + 0.012, cz + b.oz);
        brush.rotation.set(0.05, b.ry, 0.08);
        brush.scale.setScalar(1.25);
        this.scene.add(brush);
      }

      const knife = this.makeUtilityKnife();
      knife.position.set(cx - 0.04, surfY + 0.012, cz - 0.1);
      knife.rotation.y = -0.6;
      knife.scale.setScalar(1.4);
      this.scene.add(knife);

      const dish = this.makeSmallLacquerDish();
      dish.position.set(cx + 0.22, surfY, cz + 0.08);
      dish.scale.setScalar(1.3);
      this.scene.add(dish);

      const scraper = this.makeLacquerScraper();
      scraper.position.set(cx + 0.0, surfY + 0.01, cz + 0.12);
      scraper.rotation.y = 0.45;
      scraper.scale.setScalar(1.35);
      this.scene.add(scraper);
    }

    makeInkStone() {
      const g = new THREE.Group();
      const stone = this.mat(0x3a3e44, null, { roughness: 0.78, metalness: 0.08 });
      const ink = this.mat(0x0a0a0c, null, { roughness: 0.35, metalness: 0.05 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.028, 0.14), stone);
      body.position.y = 0.014;
      g.add(body);
      const well = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.012, 22), ink);
      well.position.set(-0.03, 0.024, 0);
      g.add(well);
      const wellRim = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.005, 6, 22), stone);
      wellRim.rotation.x = Math.PI / 2;
      wellRim.position.set(-0.03, 0.026, 0);
      g.add(wellRim);
      const stick = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.016, 0.024),
        this.mat(0x1a1a1c, null, { roughness: 0.7 })
      );
      stick.position.set(0.055, 0.026, 0.025);
      stick.rotation.y = 0.3;
      g.add(stick);
      return g;
    }

    makePaintBrush(len = 0.28, tipColor = 0x1a1a1a) {
      const g = new THREE.Group();
      const wood = this.mat(0xc4a06a, null, { roughness: 0.7, metalness: 0.04 });
      const ferrule = this.mat(0xb0b6bc, null, { metalness: 0.65, roughness: 0.35 });
      const tip = this.mat(tipColor, null, { roughness: 0.85 });
      const handleLen = len * 0.62;
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.011, handleLen, 10),
        wood
      );
      handle.rotation.z = Math.PI / 2;
      handle.position.x = -handleLen / 2;
      g.add(handle);
      const metal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, len * 0.12, 10),
        ferrule
      );
      metal.rotation.z = Math.PI / 2;
      metal.position.x = len * 0.02;
      g.add(metal);
      const bristle = new THREE.Mesh(new THREE.ConeGeometry(0.014, len * 0.28, 10), tip);
      bristle.rotation.z = -Math.PI / 2;
      bristle.position.x = len * 0.18;
      g.add(bristle);
      return g;
    }

    makeUtilityKnife() {
      const g = new THREE.Group();
      const body = this.mat(0xe8a020, null, { roughness: 0.55, metalness: 0.1 });
      const blade = this.mat(0xcfd4d8, null, { metalness: 0.75, roughness: 0.28 });
      const slider = this.mat(0x2a2a2c, null, { roughness: 0.6 });
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.022, 0.038), body);
      handle.position.x = -0.02;
      g.add(handle);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.024), blade);
      tip.position.set(0.075, 0.002, 0);
      g.add(tip);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.007, 0.016), blade);
      edge.position.set(0.11, 0.002, -0.003);
      edge.rotation.y = 0.4;
      g.add(edge);
      const knob = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.016, 0.02), slider);
      knob.position.set(-0.01, 0.016, 0);
      g.add(knob);
      return g;
    }

    makeSmallLacquerDish() {
      const g = new THREE.Group();
      const ceramic = this.mat(0xe8e2d6, null, { roughness: 0.55 });
      const lacquer = this.mat(0x8a1e1e, null, { roughness: 0.35, metalness: 0.12 });
      const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.038, 0.028, 18, 1, true),
        ceramic
      );
      bowl.position.y = 0.016;
      g.add(bowl);
      const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.008, 18), ceramic);
      bot.position.y = 0.005;
      g.add(bot);
      const paint = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.008, 18), lacquer);
      paint.position.y = 0.014;
      g.add(paint);
      return g;
    }

    makeLacquerScraper() {
      const g = new THREE.Group();
      const wood = this.mat(0xa88858, null, { roughness: 0.75 });
      const steel = this.mat(0xb8bec4, null, { metalness: 0.7, roughness: 0.3 });
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.013, 0.12, 10), wood);
      handle.rotation.z = Math.PI / 2;
      handle.position.x = -0.05;
      g.add(handle);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.004, 0.04), steel);
      blade.position.set(0.055, 0.003, 0);
      g.add(blade);
      return g;
    }

    makeWhiteDesktopFan() {
      // 薄荷绿 U 形支架风扇：机头镂空，扇叶清晰可见
      const g = new THREE.Group();
      const green = this.mat(0xb5d4a0, null, { roughness: 0.58, metalness: 0.04 });
      const greenSoft = this.mat(0xc2ddb0, null, { roughness: 0.62, metalness: 0.03 });
      const rose = this.mat(0xc9a07a, null, { roughness: 0.28, metalness: 0.88 });
      // 扇叶略深一档、不透明，从正面一眼能认出来
      const bladeMat = this.mat(0x7fa86a, null, {
        roughness: 0.45,
        metalness: 0.05,
        side: THREE.DoubleSide,
      });

      const headR = 0.15;
      const innerW = 0.2;
      const armT = 0.032;
      const armD = 0.058;
      const pivotY = 0.168;

      const base = new THREE.Mesh(
        new THREE.BoxGeometry(innerW + armT * 2.2, 0.024, 0.095),
        green
      );
      base.position.y = 0.012;
      g.add(base);
      const basePad = new THREE.Mesh(
        new THREE.BoxGeometry(innerW + armT * 2.4, 0.008, 0.11),
        greenSoft
      );
      basePad.position.y = 0.004;
      g.add(basePad);

      for (const sx of [-1, 1]) {
        const xArm = sx * (innerW / 2 + armT * 0.55);
        const corner = new THREE.Mesh(
          new THREE.CylinderGeometry(armT * 0.55, armT * 0.55, armD, 16),
          green
        );
        corner.rotation.x = Math.PI / 2;
        corner.position.set(xArm, 0.03, 0);
        g.add(corner);

        const arm = new THREE.Mesh(new THREE.BoxGeometry(armT, pivotY - 0.02, armD), green);
        arm.position.set(xArm, (pivotY + 0.02) / 2, 0);
        g.add(arm);

        const tip = new THREE.Mesh(new THREE.SphereGeometry(armT * 0.55, 14, 12), green);
        tip.scale.set(1, 1, armD / armT);
        tip.position.set(xArm, pivotY, 0);
        g.add(tip);

        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 24), rose);
        cap.rotation.z = Math.PI / 2;
        cap.position.set(sx * (innerW / 2 + armT * 1.05), pivotY, 0);
        g.add(cap);
        const capFace = new THREE.Mesh(new THREE.CircleGeometry(0.016, 24), rose);
        capFace.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        capFace.position.set(sx * (innerW / 2 + armT * 1.12), pivotY, 0);
        g.add(capFace);
      }

      const head = new THREE.Group();
      head.position.set(0, pivotY, 0);
      head.rotation.x = -0.22;

      // 仅圆环外壳（openEnded，绝不封死成绿盘）
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(headR, headR, 0.05, 48, 1, true),
        green
      );
      barrel.rotation.x = Math.PI / 2;
      head.add(barrel);
      const barrelOut = new THREE.Mesh(
        new THREE.CylinderGeometry(headR + 0.012, headR + 0.012, 0.05, 48, 1, true),
        green
      );
      barrelOut.rotation.x = Math.PI / 2;
      head.add(barrelOut);

      // 前后外框
      for (const z of [-0.025, 0.025]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(headR + 0.006, 0.011, 10, 48), green);
        rim.position.z = z;
        head.add(rim);
      }

      // 后侧稀疏网，不挡正面看叶
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const spoke = new THREE.Mesh(
          new THREE.BoxGeometry(0.0025, headR * 0.88, 0.002),
          greenSoft
        );
        spoke.position.set(
          Math.cos(a) * headR * 0.46,
          Math.sin(a) * headR * 0.46,
          -0.02
        );
        spoke.rotation.z = a;
        head.add(spoke);
      }
      const rearRing = new THREE.Mesh(new THREE.TorusGeometry(headR * 0.35, 0.004, 6, 24), greenSoft);
      rearRing.position.z = -0.02;
      head.add(rearRing);

      // 三片宽扇叶（Shape 弯叶，占满视野）
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.03, 18), greenSoft);
      motor.rotation.x = Math.PI / 2;
      head.add(motor);

      const bladeShape = new THREE.Shape();
      bladeShape.moveTo(0.025, -0.03);
      bladeShape.bezierCurveTo(0.06, -0.07, 0.11, -0.06, 0.135, -0.015);
      bladeShape.bezierCurveTo(0.14, 0.02, 0.11, 0.055, 0.06, 0.045);
      bladeShape.bezierCurveTo(0.04, 0.035, 0.028, 0.015, 0.025, 0.01);
      bladeShape.closePath();
      const bladeGeo = new THREE.ShapeGeometry(bladeShape, 16);
      for (let i = 0; i < 3; i++) {
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        blade.rotation.z = (i / 3) * Math.PI * 2 + 0.15;
        blade.rotation.x = 0.35;
        blade.position.z = 0.005;
        head.add(blade);
        // 加厚感：背面再贴一层略偏色
        const blade2 = new THREE.Mesh(bladeGeo, bladeMat);
        blade2.rotation.z = (i / 3) * Math.PI * 2 + 0.15;
        blade2.rotation.x = 0.35;
        blade2.position.z = -0.002;
        head.add(blade2);
      }

      // 正面细辐条（少而细，透出扇叶）
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const spoke = new THREE.Mesh(
          new THREE.BoxGeometry(0.0022, headR * 0.92, 0.0022),
          greenSoft
        );
        spoke.position.set(
          Math.cos(a) * headR * 0.48,
          Math.sin(a) * headR * 0.48,
          0.032
        );
        spoke.rotation.z = a;
        head.add(spoke);
      }

      // 玫瑰金中心
      const hubRing = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 8, 28), rose);
      hubRing.position.z = 0.036;
      head.add(hubRing);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.016, 28), rose);
      hub.rotation.x = Math.PI / 2;
      hub.position.z = 0.038;
      head.add(hub);
      const hubFace = new THREE.Mesh(new THREE.CircleGeometry(0.019, 28), rose);
      hubFace.position.z = 0.047;
      head.add(hubFace);

      g.add(head);
      return g;
    }

    addDeskPortfolioBoxStacks(deskX, deskZ, deskLen, deskWid, deskTopY) {
      // 靠外墙一端 ∩ 长格挡内侧：自墙角沿长格挡往走廊（-X）依次 9、9、5、3
      const boxX = 0.4;
      const boxZ = 0.3;
      const boxH = 0.118;
      const gapX = 0.02;
      const gapY = 0.012; // 层间空隙，才能看出层数
      const heights = [9, 9, 5, 3];
      const z0 = deskZ - deskWid / 2 + boxZ / 2 + 0.025; // 贴长格挡（靠墙侧桌沿）
      // 从桌子靠墙端（+X）起排，不要短翼那一侧
      let x = deskX + deskLen / 2 - boxX / 2 - 0.06;
      for (const n of heights) {
        for (let i = 0; i < n; i++) {
          const box = this.makeRedSidePortfolioBox(boxX, boxZ, boxH);
          box.position.set(x, deskTopY + boxH / 2 + i * (boxH + gapY), z0);
          this.scene.add(box);
        }
        x -= boxX + gapX;
      }
    }

    makeRedSidePortfolioBox(sx, sz, h) {
      // ±X 两侧朱红，顶/底/正/背白色；背离长格挡的 +Z 面开口短挂绳
      // 盒盖分缝 + 描边，避免整摞糊成一块
      const g = new THREE.Group();
      const red = this.mat(0xc41e2a, null, { roughness: 0.55, metalness: 0.05 });
      const white = this.mat(0xf4f3f0, null, { roughness: 0.78, metalness: 0.02 });
      const seam = this.mat(0xd0cec8, null, { roughness: 0.85, metalness: 0.02 });
      const hole = this.mat(0x222222, null, { roughness: 0.92, metalness: 0.02 });
      const cord = this.mat(0x6e6e6a, null, { roughness: 0.88, metalness: 0.04 });
      const edgeMat = new THREE.LineBasicMaterial({ color: 0xb8b6b0 });

      const bodyH = h * 0.86;
      const lidH = h * 0.14;
      // +X -X +Y -Y +Z -Z：两侧红，其余白
      const body = new THREE.Mesh(new THREE.BoxGeometry(sx, bodyH, sz), [
        red,
        red,
        white,
        white,
        white,
        white,
      ]);
      body.position.y = -lidH / 2;
      g.add(body);

      // 略探出的白盖，层间形成清晰分缝
      const lid = new THREE.Mesh(new THREE.BoxGeometry(sx * 1.01, lidH, sz * 1.01), [
        red,
        red,
        white,
        seam,
        white,
        white,
      ]);
      lid.position.y = bodyH / 2;
      g.add(lid);

      // 红侧腰线，强化「单盒」轮廓
      for (const sxSign of [-1, 1]) {
        const band = new THREE.Mesh(
          new THREE.PlaneGeometry(sz * 0.92, h * 0.03),
          seam
        );
        band.rotation.y = sxSign > 0 ? Math.PI / 2 : -Math.PI / 2;
        band.position.set(sxSign * (sx / 2 + 0.0012), 0, 0);
        g.add(band);
      }

      // 盒体描边
      const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, h, sz));
      const edges = new THREE.LineSegments(edgeGeo, edgeMat);
      g.add(edges);

      // +Z（朝桌内、背离长格挡）：开口 + 短挂绳
      const slot = new THREE.Mesh(new THREE.PlaneGeometry(sx * 0.28, h * 0.09), hole);
      slot.position.set(0, h * 0.22, sz / 2 + 0.0015);
      g.add(slot);
      const loopR = Math.min(sx, h) * 0.11;
      const loop = new THREE.Mesh(
        new THREE.TorusGeometry(loopR, loopR * 0.28, 6, 14, Math.PI),
        cord
      );
      loop.rotation.x = Math.PI / 2;
      loop.position.set(0, h * 0.14, sz / 2 + loopR * 0.55);
      g.add(loop);
      // 绳根固定点
      for (const ox of [-loopR * 0.65, loopR * 0.65]) {
        const peg = new THREE.Mesh(new THREE.SphereGeometry(loopR * 0.22, 6, 6), cord);
        peg.position.set(ox, h * 0.2, sz / 2 + 0.004);
        g.add(peg);
      }
      return g;
    }

    makeBlackSwingArmLamp() {
      // 复刻 CAD：阶梯圆座（偏心立柱）+ 平行四边形肘板 + 双节平行杆 + 钟形罩；全黑
      const g = new THREE.Group();
      const black = this.mat(0x101012, null, { roughness: 0.38, metalness: 0.42 });
      const blackSoft = this.mat(0x1c1c20, null, { roughness: 0.5, metalness: 0.28 });
      const whiteIn = this.mat(0xf2f0ea, null, { roughness: 0.6, metalness: 0.04 });

      const addBolt = (parent, x, y, z, r = 0.007) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.018, 10), blackSoft);
        m.rotation.x = Math.PI / 2;
        m.position.set(x, y, z);
        parent.add(m);
      };

      const addPlate = (parent, w, h, t = 0.01) => {
        const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), black);
        parent.add(p);
        return p;
      };

      const addRodPair = (parent, len, gap = 0.018) => {
        for (const ox of [-gap, gap]) {
          const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, len, 8), black);
          rod.position.set(ox, len / 2, 0);
          parent.add(rod);
        }
      };

      // 1) 阶梯圆座（对照建模图）
      const tiers = [
        [0.125, 0.018, 0.009],
        [0.105, 0.014, 0.025],
        [0.088, 0.012, 0.038],
      ];
      for (const [r, h, y] of tiers) {
        const disk = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32), black);
        disk.position.y = y;
        g.add(disk);
      }
      // 偏心立柱（靠座缘）
      const postX = 0.055;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.07, 12), black);
      post.position.set(postX, 0.075, 0);
      g.add(post);

      // 2) 根部三角板
      const root = new THREE.Group();
      root.position.set(postX, 0.11, 0);
      g.add(root);
      const rootPlate = addPlate(root, 0.055, 0.07, 0.012);
      rootPlate.position.set(0, 0.02, 0);
      addBolt(root, -0.015, 0.0, 0.01);
      addBolt(root, 0.015, 0.0, 0.01);
      addBolt(root, 0, 0.04, 0.01);

      // 下臂：陡角上扬
      const L1 = 0.52;
      const lower = new THREE.Group();
      root.add(lower);
      addRodPair(lower, L1);
      // 下臂张簧（根部 → 下臂中段）
      for (const sx of [-0.025, 0.025]) {
        const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 8), blackSoft);
        spring.position.set(sx, 0.14, 0.016);
        spring.rotation.z = 0.35;
        lower.add(spring);
      }
      root.rotation.z = -0.65;

      // 3) 肘部平行四边形大板（四枢轴）
      const elbow = new THREE.Group();
      elbow.position.y = L1;
      lower.add(elbow);
      const elbowPlate = addPlate(elbow, 0.08, 0.1, 0.012);
      elbowPlate.position.set(0.01, 0.02, 0);
      addBolt(elbow, -0.02, -0.015, 0.01, 0.008);
      addBolt(elbow, 0.02, -0.015, 0.01, 0.008);
      addBolt(elbow, -0.02, 0.055, 0.01, 0.008);
      addBolt(elbow, 0.02, 0.055, 0.01, 0.008);
      const eSpring = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 8), blackSoft);
      eSpring.position.set(0.03, 0.03, 0.018);
      eSpring.rotation.z = -0.4;
      elbow.add(eSpring);

      // 上臂：再折向水平前探
      const L2 = 0.48;
      const upper = new THREE.Group();
      elbow.add(upper);
      upper.position.set(0, 0.05, 0);
      addRodPair(upper, L2);
      elbow.rotation.z = 1.75;

      // 4) 头部：罩口明确朝前下方（对准画作），勿朝天
      const wrist = new THREE.Group();
      wrist.position.y = L2;
      upper.add(wrist);
      const wristPlate = addPlate(wrist, 0.05, 0.055, 0.011);
      wristPlate.position.set(0, 0.01, 0);
      addBolt(wrist, -0.012, 0, 0.01);
      addBolt(wrist, 0.012, 0, 0.01);
      addBolt(wrist, 0, 0.028, 0.01);

      // 灯头：罩口沿本地 -Z（配合 lookAt 对准画作）
      const head = new THREE.Group();
      wrist.add(head);
      head.position.set(0.02, 0.02, 0);

      const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.06, 14), black);
      socket.position.set(0, 0, -0.02);
      head.add(socket);

      // Lathe 大口在 +Y；转到开口朝本地 -Z
      const shadePts = [
        new THREE.Vector2(0.022, 0),
        new THREE.Vector2(0.03, 0.02),
        new THREE.Vector2(0.032, 0.055),
        new THREE.Vector2(0.04, 0.08),
        new THREE.Vector2(0.062, 0.11),
        new THREE.Vector2(0.085, 0.13),
        new THREE.Vector2(0.095, 0.135),
      ];
      const shade = new THREE.Mesh(new THREE.LatheGeometry(shadePts, 24), black);
      shade.rotation.x = -Math.PI / 2; // +Y → -Z
      shade.position.set(0, 0, -0.05);
      head.add(shade);
      const shadeIn = new THREE.Mesh(
        new THREE.LatheGeometry(
          shadePts.map((p) => new THREE.Vector2(p.x * 0.9, p.y)),
          24
        ),
        whiteIn
      );
      shadeIn.rotation.x = -Math.PI / 2;
      shadeIn.position.set(0, 0, -0.052);
      head.add(shadeIn);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.005, 6, 24), black);
      rim.position.set(0, 0, -0.185);
      head.add(rim);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.028, 12, 12),
        new THREE.MeshStandardMaterial({
          color: 0xfff4e0,
          emissive: 0xffe6b0,
          emissiveIntensity: 2.2,
          roughness: 0.2,
        })
      );
      bulb.position.set(0, 0, -0.12);
      head.add(bulb);

      const aim = new THREE.Object3D();
      aim.position.set(0, 0, -0.28); // 罩口前方（-Z）
      head.add(aim);
      g.userData.head = head;
      g.userData.shadeAim = aim;

      return g;
    }

    makePainterEaselWithArt(paintW, paintH, frameH = null) {
      // 木质竖架略后倾 + 竖幅画；架比画大一圈；局部 +Z 为画面朝向
      const g = new THREE.Group();
      const wood = this.mat(0x8a6a48, null, { roughness: 0.72, metalness: 0.05 });
      const woodDeep = this.mat(0x5a4030, null, { roughness: 0.68, metalness: 0.06 });
      const lean = 0.14; // 后倾约 8°
      const standH = frameH || paintH + 0.28;
      const frameW = Math.max(paintW + 0.16, paintW * 1.14);
      const postT = 0.055;

      const stand = new THREE.Group();
      // 左右立柱（按架宽）
      for (const sx of [-frameW * 0.42, frameW * 0.42]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(postT, standH, postT), wood);
        post.position.set(sx, standH / 2, 0);
        stand.add(post);
      }
      // 上下横档
      const artY0 = (standH - paintH) * 0.42;
      for (const y of [0.16, artY0 + paintH * 0.5, standH - 0.08]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(frameW * 0.9, postT * 0.85, postT),
          woodDeep
        );
        rail.position.set(0, y, 0);
        stand.add(rail);
      }
      // 后撑脚
      for (const sx of [-frameW * 0.35, frameW * 0.35]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(postT * 0.8, standH * 0.85, postT * 0.8), wood);
        leg.position.set(sx, standH * 0.38, -0.32);
        leg.rotation.x = 0.35;
        stand.add(leg);
      }
      // 底托
      const base = new THREE.Mesh(new THREE.BoxGeometry(frameW * 0.95, 0.04, 0.22), woodDeep);
      base.position.set(0, 0.02, -0.02);
      stand.add(base);

      // 画面（比架小一圈）
      const map = this.makePainterCanvasTexture();
      const art = new THREE.Mesh(
        new THREE.BoxGeometry(paintW, paintH, 0.035),
        [
          woodDeep,
          woodDeep,
          woodDeep,
          woodDeep,
          new THREE.MeshStandardMaterial({ map, roughness: 0.75, metalness: 0.04 }),
          woodDeep,
        ]
      );
      art.position.set(0, artY0 + paintH / 2, postT * 0.6);
      stand.add(art);

      stand.rotation.x = -lean; // 上端后仰，方便坐着画
      g.add(stand);

      // 整架面朝走廊侧坐姿：画面朝 -X（朝椅子）
      g.rotation.y = -Math.PI / 2;
      return g;
    }

    makePainterCanvasTexture() {
      // 对照实拍：浅赭底古装人物竖幅
      const c = document.createElement("canvas");
      c.width = 360;
      c.height = 560;
      const ctx = c.getContext("2d");
      const grd = ctx.createLinearGradient(0, 0, 0, 560);
      grd.addColorStop(0, "#e8d8b8");
      grd.addColorStop(0.5, "#dcc8a0");
      grd.addColorStop(1, "#c8b488");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 360, 560);

      // 松竹疏影
      ctx.strokeStyle = "#4a5a38";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(60, 520);
      ctx.quadraticCurveTo(40, 300, 80, 80);
      ctx.stroke();
      ctx.fillStyle = "#3d5a38";
      for (const [x, y, r] of [
        [50, 100, 22],
        [85, 70, 18],
        [70, 140, 16],
        [280, 200, 14],
        [300, 240, 12],
      ]) {
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.65, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // 竹
      ctx.strokeStyle = "#5a7a48";
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(290 + i * 12, 480);
        ctx.lineTo(300 + i * 8, 160 + i * 20);
        ctx.stroke();
      }

      // 山石
      ctx.fillStyle = "#9a8a70";
      ctx.beginPath();
      ctx.moveTo(40, 420);
      ctx.quadraticCurveTo(20, 360, 70, 340);
      ctx.quadraticCurveTo(120, 380, 90, 430);
      ctx.fill();

      const figure = (x, y, s, robe) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(s, s);
        ctx.fillStyle = "#f0e8dc";
        ctx.beginPath();
        ctx.arc(0, -36, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = robe;
        ctx.beginPath();
        ctx.moveTo(-12, -26);
        ctx.quadraticCurveTo(-20, 10, -10, 40);
        ctx.lineTo(12, 40);
        ctx.quadraticCurveTo(20, 10, 12, -26);
        ctx.fill();
        ctx.fillStyle = "#3a3028";
        ctx.fillRect(-7, -42, 14, 8);
        ctx.restore();
      };
      figure(150, 300, 1.5, "#6a7a58");
      figure(200, 320, 1.35, "#c8c0b0");
      figure(175, 380, 1.2, "#a89070");
      // 抚琴姿
      ctx.strokeStyle = "#5a4030";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(155, 310);
      ctx.lineTo(210, 318);
      ctx.stroke();

      const map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
      return map;
    }

    makeIronLatticeScreen(width, height, iron, ironDark, withTopX = true) {
      // 本地：宽沿 X、板面法线 +Z；灰铁方管镂空格
      const g = new THREE.Group();
      const bar = 0.045;
      const cols = Math.max(2, Math.round(width / 0.45));
      const rows = 4;
      const cellW = (width - bar) / cols;
      const cellH = (height - bar) / rows;

      // 外框
      const top = new THREE.Mesh(new THREE.BoxGeometry(width, bar, bar), iron);
      top.position.set(0, height - bar / 2, 0);
      g.add(top);
      const bot = new THREE.Mesh(new THREE.BoxGeometry(width, bar, bar), ironDark);
      bot.position.set(0, bar / 2, 0);
      g.add(bot);
      for (const sx of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(bar, height, bar), iron);
        side.position.set(sx * (width / 2 - bar / 2), height / 2, 0);
        g.add(side);
      }

      // 竖档
      for (let c = 1; c < cols; c++) {
        const x = -width / 2 + bar / 2 + c * cellW;
        const v = new THREE.Mesh(new THREE.BoxGeometry(bar * 0.85, height - bar, bar * 0.85), iron);
        v.position.set(x, height / 2, 0);
        g.add(v);
      }
      // 横档
      for (let r = 1; r < rows; r++) {
        const y = bar / 2 + r * cellH;
        const hBar = new THREE.Mesh(new THREE.BoxGeometry(width - bar, bar * 0.85, bar * 0.85), iron);
        hBar.position.set(0, y, 0);
        g.add(hBar);
      }

      // 顶层若干格加 X 斜撑（对照实拍）
      if (withTopX) {
        const topRowY = height - bar / 2 - cellH / 2;
        for (let c = 0; c < cols; c++) {
          if (c % 2 === 0) continue; // 隔格打叉
          const x = -width / 2 + bar / 2 + cellW / 2 + c * cellW;
          const len = Math.hypot(cellW - bar, cellH - bar) * 0.92;
          for (const rot of [0.65, -0.65]) {
            const cross = new THREE.Mesh(new THREE.BoxGeometry(len, bar * 0.55, bar * 0.55), ironDark);
            cross.position.set(x, topRowY, 0);
            cross.rotation.z = rot;
            g.add(cross);
          }
        }
      }

      // 底托脚
      for (const sx of [-width / 2 + 0.08, width / 2 - 0.08]) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.1), ironDark);
        foot.position.set(sx, 0.02, 0.02);
        g.add(foot);
      }
      return g;
    }

    makePaintWorkDesk(tw = 1.35, td = 0.7, withProps = true) {
      const g = new THREE.Group();
      const topMat = this.mat(0xd8dce0, null, { roughness: 0.55, metalness: 0.08 });
      const legMat = this.mat(0x5a6066, null, { metalness: 0.4, roughness: 0.45 });
      const topY = 0.75;
      const top = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.05, td), topMat);
      top.position.y = topY;
      g.add(top);
      for (const [lx, lz] of [
        [-tw / 2 + 0.08, -td / 2 + 0.08],
        [tw / 2 - 0.08, -td / 2 + 0.08],
        [-tw / 2 + 0.08, td / 2 - 0.08],
        [tw / 2 - 0.08, td / 2 - 0.08],
      ]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, topY - 0.02, 0.05), legMat);
        leg.position.set(lx, (topY - 0.02) / 2, lz);
        g.add(leg);
      }
      if (!withProps) return g;
      // 桌面杂物示意
      const lamp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.04, 0.35, 10),
        this.mat(0x333338, null, { roughness: 0.5 })
      );
      lamp.position.set(-0.4, topY + 0.2, -0.15);
      g.add(lamp);
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.1, 12),
        this.mat(0x888890, null, { roughness: 0.6 })
      );
      shade.position.set(-0.4, topY + 0.42, -0.15);
      g.add(shade);
      for (let i = 0; i < 4; i++) {
        const bottle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.028, 0.12 + (i % 2) * 0.04, 8),
          this.mat([0x2a5a8a, 0x8a3020, 0xd8d8d0, 0x3a3a38][i], null, { roughness: 0.4 })
        );
        bottle.position.set(-0.1 + i * 0.12, topY + 0.08, 0.15);
        g.add(bottle);
      }
      const paper = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.01, 0.25),
        this.mat(0xf2f0ea, null, { roughness: 0.9 })
      );
      paper.position.set(0.35, topY + 0.03, 0);
      paper.rotation.y = 0.2;
      g.add(paper);
      return g;
    }

    makeBlackSquareArmchair(targetW = 0.5) {
      // 对照参考：黑色方形扶手椅；宽度可按桌长 1/4 传入
      const g = new THREE.Group();
      const frame = this.mat(0x121214, null, { roughness: 0.45, metalness: 0.08 });
      const leather = this.mat(0x1a1a1c, null, { roughness: 0.38, metalness: 0.05 });
      const seatW = targetW;
      const seatD = targetW * 0.92;
      const seatY = Math.min(0.48, 0.38 + targetW * 0.12);
      const legT = Math.max(0.045, targetW * 0.09);
      const armH = Math.min(0.68, seatY + 0.22); // 仍低于桌面 0.75

      // 四条方腿
      const inset = 0.04;
      for (const [lx, lz] of [
        [-seatW / 2 + inset, -seatD / 2 + inset],
        [seatW / 2 - inset, -seatD / 2 + inset],
        [-seatW / 2 + inset, seatD / 2 - inset],
        [seatW / 2 - inset, seatD / 2 - inset],
      ]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(legT, seatY - 0.02, legT), frame);
        leg.position.set(lx, (seatY - 0.02) / 2, lz);
        g.add(leg);
      }
      // 左右侧横撑
      for (const sx of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(legT, legT, seatD - inset * 2), frame);
        rail.position.set(sx * (seatW / 2 - inset), 0.18, 0);
        g.add(rail);
      }
      // 前/后横撑
      for (const sz of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(seatW - inset * 2, legT, legT), frame);
        rail.position.set(0, 0.18, sz * (seatD / 2 - inset));
        g.add(rail);
      }

      // 厚座垫
      const seat = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.04, 0.08, seatD - 0.04), leather);
      seat.position.y = seatY + 0.02;
      g.add(seat);

      // 高靠背（略后倾）
      const backH = seatW * 1.15 * (2 / 3); // 削掉约三分之一
      const back = new THREE.Mesh(
        new THREE.BoxGeometry(seatW - legT, backH, Math.max(0.07, seatW * 0.14)),
        leather
      );
      back.position.set(0, seatY + 0.08 + backH / 2, -seatD / 2 + 0.04);
      back.rotation.x = -0.08;
      g.add(back);
      // 靠背两侧立框
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(legT, backH + 0.06, legT), frame);
        post.position.set(sx * (seatW / 2 - inset), seatY + 0.06 + (backH + 0.06) / 2, -seatD / 2 + 0.02);
        g.add(post);
      }

      // 扶手：自靠背向前水平伸出
      for (const sx of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(legT, legT, seatD * 0.75), frame);
        arm.position.set(sx * (seatW / 2 - inset), armH, 0.02);
        g.add(arm);
        const armFront = new THREE.Mesh(new THREE.BoxGeometry(legT, armH - seatY, legT), frame);
        armFront.position.set(
          sx * (seatW / 2 - inset),
          seatY + (armH - seatY) / 2,
          seatD / 2 - inset
        );
        g.add(armFront);
      }

      return g;
    }

    makeLandscapeArtPanel(w, h) {
      const g = new THREE.Group();
      const wood = this.mat(0x5a4030, null, { roughness: 0.7, metalness: 0.05 });
      const map = this.makeLandscapeArtTexture();
      const face = new THREE.MeshStandardMaterial({ map, roughness: 0.78, metalness: 0.03 });
      const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.045), [
        wood,
        wood,
        wood,
        wood,
        face,
        wood,
      ]);
      g.add(board);
      // 低矮木托
      const stand = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.04, 0.1), wood);
      stand.position.set(0, -h / 2 - 0.01, 0.02);
      g.add(stand);
      return g;
    }

    makeBuddhaArtPanel(w, h) {
      const g = new THREE.Group();
      const frame = this.mat(0x4a4a4c, null, { roughness: 0.6, metalness: 0.06 });
      const map = this.makeBuddhaArtTexture();
      const face = new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0.08 });
      const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), [
        frame,
        frame,
        frame,
        frame,
        face,
        frame,
      ]);
      g.add(board);
      return g;
    }

    makeLandscapeArtTexture() {
      // 对照实拍：青绿山水 + 松树奇石 + 古装人物 + 题跋
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 512;
      const ctx = c.getContext("2d");
      // 旧绢底
      const grd = ctx.createLinearGradient(0, 0, 0, 512);
      grd.addColorStop(0, "#d8d0bc");
      grd.addColorStop(0.55, "#cfc6b0");
      grd.addColorStop(1, "#b8b09a");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 512, 512);

      // 远山层
      ctx.fillStyle = "#8a9a7a";
      ctx.beginPath();
      ctx.moveTo(0, 220);
      ctx.quadraticCurveTo(120, 140, 240, 200);
      ctx.quadraticCurveTo(360, 120, 512, 190);
      ctx.lineTo(512, 280);
      ctx.lineTo(0, 280);
      ctx.fill();
      ctx.fillStyle = "#6e8068";
      ctx.beginPath();
      ctx.moveTo(180, 250);
      ctx.quadraticCurveTo(320, 160, 512, 230);
      ctx.lineTo(512, 320);
      ctx.lineTo(160, 320);
      ctx.fill();

      // 中景岩块（层叠）
      const rock = (x, y, s, rot = 0) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.scale(s, s);
        ctx.fillStyle = "#9a8a72";
        ctx.strokeStyle = "#5a4a38";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-40, 30);
        ctx.lineTo(-50, -10);
        ctx.quadraticCurveTo(-20, -55, 20, -40);
        ctx.quadraticCurveTo(55, -20, 45, 25);
        ctx.quadraticCurveTo(10, 45, -40, 30);
        ctx.fill();
        ctx.stroke();
        // 皴擦
        ctx.strokeStyle = "rgba(70,55,40,0.45)";
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(-30 + i * 12, 10);
          ctx.quadraticCurveTo(-10 + i * 8, -20 - i * 4, 20 + i * 4, -5);
          ctx.stroke();
        }
        ctx.restore();
      };
      rock(340, 300, 2.2, -0.1);
      rock(400, 340, 1.6, 0.15);
      rock(280, 360, 1.3, -0.2);

      // 松树
      ctx.save();
      ctx.translate(95, 380);
      ctx.strokeStyle = "#4a3828";
      ctx.fillStyle = "#4a3828";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(0, 80);
      ctx.quadraticCurveTo(-10, 20, 8, -40);
      ctx.quadraticCurveTo(20, -90, 5, -130);
      ctx.stroke();
      ctx.fillStyle = "#3d5a38";
      for (const [px, py, r] of [
        [-25, -90, 28],
        [10, -120, 32],
        [35, -85, 26],
        [-5, -55, 22],
        [40, -50, 18],
      ]) {
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * 0.7, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 祥云
      ctx.fillStyle = "rgba(245,240,225,0.85)";
      ctx.beginPath();
      ctx.ellipse(70, 90, 40, 16, -0.2, 0, Math.PI * 2);
      ctx.ellipse(100, 80, 35, 14, 0.1, 0, Math.PI * 2);
      ctx.ellipse(55, 75, 22, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      // 古装三人
      const sage = (x, y, robe, facing = 1) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(facing, 1);
        ctx.fillStyle = "#e8e0d0";
        ctx.beginPath();
        ctx.arc(0, -28, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = robe;
        ctx.beginPath();
        ctx.moveTo(-10, -20);
        ctx.quadraticCurveTo(-18, 10, -12, 40);
        ctx.lineTo(12, 40);
        ctx.quadraticCurveTo(18, 10, 10, -20);
        ctx.fill();
        ctx.fillStyle = "#3a3028";
        ctx.fillRect(-6, -34, 12, 8);
        ctx.restore();
      };
      sage(200, 390, "#6a7a58", 1);
      sage(235, 395, "#c8c2b4", -1);
      sage(265, 388, "#b8b2a4", 1);

      // 题跋竖框
      ctx.fillStyle = "rgba(90,70,50,0.15)";
      ctx.fillRect(18, 40, 36, 150);
      ctx.strokeStyle = "#6a5038";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(18, 40, 36, 150);
      ctx.fillStyle = "#3a2a1a";
      ctx.font = "18px 'Songti SC','STSong','SimSun',serif";
      ctx.textAlign = "center";
      const title = "松下问童子";
      [...title].forEach((ch, i) => ctx.fillText(ch, 36, 68 + i * 22));

      const map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
      return map;
    }

    makeBuddhaArtTexture() {
      // 对照实拍：灰底坐佛 / 莲座，紫蓝袍
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = 560;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#7a7a7e";
      ctx.fillRect(0, 0, 320, 560);
      // 轻微渐变底
      const bg = ctx.createLinearGradient(0, 0, 0, 560);
      bg.addColorStop(0, "#8a8a8e");
      bg.addColorStop(1, "#6c6c70");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 320, 560);

      const cx = 160;

      // 莲座多层
      const pedestal = (y, rx, ry, color) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(40,30,20,0.35)";
        ctx.stroke();
      };
      pedestal(480, 110, 28, "#8a6a48");
      pedestal(455, 95, 22, "#c4a060");
      // 莲瓣
      ctx.fillStyle = "#e8d8b0";
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI + (i / 9) * Math.PI;
        const px = cx + Math.cos(a) * 70;
        const py = 430 + Math.sin(a) * 12;
        ctx.beginPath();
        ctx.ellipse(px, py, 16, 28, a + Math.PI / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      pedestal(420, 75, 16, "#f0e0b8");

      // 身躯（白肤）
      ctx.fillStyle = "#f2ebe3";
      ctx.beginPath();
      ctx.ellipse(cx, 280, 55, 70, 0, 0, Math.PI * 2);
      ctx.fill();
      // 结跏趺坐腿
      ctx.beginPath();
      ctx.ellipse(cx, 360, 70, 35, 0, 0, Math.PI * 2);
      ctx.fill();

      // 紫蓝袍
      const robe = ctx.createLinearGradient(cx - 60, 200, cx + 60, 380);
      robe.addColorStop(0, "#6a4a8a");
      robe.addColorStop(0.45, "#3a5a9a");
      robe.addColorStop(1, "#8a3a4a");
      ctx.fillStyle = robe;
      ctx.beginPath();
      ctx.moveTo(cx - 20, 200);
      ctx.quadraticCurveTo(cx - 85, 260, cx - 70, 370);
      ctx.quadraticCurveTo(cx, 400, cx + 70, 370);
      ctx.quadraticCurveTo(cx + 85, 260, cx + 20, 200);
      ctx.fill();
      // 披帛金边
      ctx.strokeStyle = "#d4b060";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 50, 230);
      ctx.quadraticCurveTo(cx - 90, 300, cx - 40, 380);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 50, 230);
      ctx.quadraticCurveTo(cx + 90, 300, cx + 40, 380);
      ctx.stroke();

      // 头与肉髻
      ctx.fillStyle = "#f2ebe3";
      ctx.beginPath();
      ctx.arc(cx, 155, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2a2a2e";
      ctx.beginPath();
      ctx.arc(cx, 145, 36, Math.PI * 1.05, Math.PI * 1.95);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, 118, 18, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      // 五官简笔
      ctx.strokeStyle = "#5a4a40";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx - 14, 155);
      ctx.quadraticCurveTo(cx - 8, 152, cx - 4, 155);
      ctx.moveTo(cx + 4, 155);
      ctx.quadraticCurveTo(cx + 8, 152, cx + 14, 155);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 6, 168);
      ctx.quadraticCurveTo(cx, 172, cx + 6, 168);
      ctx.stroke();
      // 白毫
      ctx.fillStyle = "#f8f4e8";
      ctx.beginPath();
      ctx.arc(cx, 148, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // 背光淡圈
      ctx.strokeStyle = "rgba(240,220,160,0.35)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, 200, 95, 0, Math.PI * 2);
      ctx.stroke();

      const map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
      return map;
    }

    makeSilhouetteArtPanel(w, h, variant = 0) {
      // 对照实拍：深灰底 + 浅赭剪影人物竖幅画板
      const g = new THREE.Group();
      const frame = this.mat(0x2a2a2c, null, { roughness: 0.65, metalness: 0.06 });
      const map = this.makeSilhouetteArtTexture(variant);
      const face = new THREE.MeshStandardMaterial({
        map,
        roughness: 0.72,
        metalness: 0.04,
      });
      const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), [
        frame,
        frame,
        frame,
        frame,
        face, // +Z
        frame, // -Z
      ]);
      g.add(board);
      // 细边框
      const rim = this.mat(0x1a1a1c, null, { roughness: 0.55 });
      this.addCabinetMolding(g, 0, 0, 0.022, w - 0.02, h - 0.02, rim, 0.012);
      return g;
    }

    makeSilhouetteArtTexture(variant = 0) {
      // 对照实拍：皮影/剪纸感浅赭剪影，深炭灰底
      const c = document.createElement("canvas");
      c.width = 384;
      c.height = 880;
      const ctx = c.getContext("2d");
      const W = c.width;
      const H = c.height;
      ctx.fillStyle = "#353538";
      ctx.fillRect(0, 0, W, H);
      // 哑光底纹
      for (let i = 0; i < 120; i++) {
        ctx.fillStyle = `rgba(42,42,46,${0.12 + (i % 4) * 0.03})`;
        ctx.fillRect((i * 61) % W, (i * 97) % H, 18 + (i % 7), 22);
      }

      const ink = "#d8c49a";
      ctx.fillStyle = ink;
      ctx.strokeStyle = ink;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const robeFigure = (x, y, s, opts = {}) => {
        const {
          staff = false,
          armL = 0,
          armR = 0,
          lean = 0,
          wide = 1,
          hop = false,
        } = opts;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(lean);
        ctx.scale(s * wide, s);
        // 头巾/头
        ctx.beginPath();
        ctx.ellipse(0, -52, 9, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-11, -58);
        ctx.quadraticCurveTo(0, -72, 12, -56);
        ctx.quadraticCurveTo(4, -50, -11, -58);
        ctx.fill();
        // 宽袖袍
        ctx.beginPath();
        ctx.moveTo(-8, -42);
        ctx.bezierCurveTo(-28 - armL * 8, -28, -34 - armL * 12, 8, -26, 48);
        ctx.lineTo(-10, 52);
        ctx.lineTo(10, 52);
        ctx.lineTo(26, 48);
        ctx.bezierCurveTo(34 + armR * 12, 8, 28 + armR * 8, -28, 8, -42);
        ctx.quadraticCurveTo(0, -38, -8, -42);
        ctx.fill();
        // 下摆开叉感
        ctx.beginPath();
        ctx.moveTo(-6, 20);
        ctx.lineTo(-14, 54);
        ctx.lineTo(0, 50);
        ctx.lineTo(14, 54);
        ctx.lineTo(6, 20);
        ctx.fill();
        // 足
        ctx.beginPath();
        ctx.ellipse(-10, 56, 7, 3.5, -0.2, 0, Math.PI * 2);
        ctx.ellipse(10, 56, 7, 3.5, 0.2, 0, Math.PI * 2);
        ctx.fill();
        if (hop) {
          ctx.beginPath();
          ctx.moveTo(8, -20);
          ctx.quadraticCurveTo(36, -40, 42, -8);
          ctx.lineTo(28, 4);
          ctx.quadraticCurveTo(22, -16, 6, -8);
          ctx.fill();
        }
        if (staff) {
          ctx.lineWidth = 4.5;
          ctx.beginPath();
          ctx.moveTo(6, -18);
          ctx.lineTo(10, -96);
          ctx.stroke();
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.arc(10, -104, 9, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      };

      const workFigure = (x, y, s, tool = 0) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(s, s);
        ctx.beginPath();
        ctx.ellipse(0, -22, 7, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        // 躬身
        ctx.beginPath();
        ctx.moveTo(-6, -14);
        ctx.bezierCurveTo(-22, -4, -24, 18, -8, 28);
        ctx.lineTo(12, 26);
        ctx.bezierCurveTo(20, 10, 16, -8, 6, -14);
        ctx.fill();
        ctx.lineWidth = 3.5;
        if (tool === 0) {
          ctx.beginPath();
          ctx.moveTo(8, 4);
          ctx.lineTo(34, 22);
          ctx.lineTo(28, 28);
          ctx.lineTo(4, 10);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(-4, 8);
          ctx.lineTo(-30, 30);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-36, 26);
          ctx.lineTo(-24, 36);
          ctx.lineTo(-20, 28);
          ctx.fill();
        }
        ctx.restore();
      };

      const rainDashes = (x0, y0, n = 8) => {
        ctx.lineWidth = 2.2;
        for (let i = 0; i < n; i++) {
          const x = x0 + i * 14;
          ctx.beginPath();
          ctx.moveTo(x, y0);
          ctx.lineTo(x, y0 + 18 + (i % 3) * 8);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + 5, y0 + 28);
          ctx.lineTo(x + 5, y0 + 42 + (i % 2) * 6);
          ctx.stroke();
        }
      };

      const flora = (x, y, s = 1) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(s, s);
        ctx.beginPath();
        ctx.moveTo(0, 20);
        ctx.quadraticCurveTo(-16, 0, -6, -22);
        ctx.quadraticCurveTo(0, -8, 8, -24);
        ctx.quadraticCurveTo(18, 0, 0, 20);
        ctx.fill();
        ctx.restore();
      };

      if (variant === 0) {
        // 左幅：左上跃动身影，下部劳作 + 雨丝
        robeFigure(78, 150, 1.35, { hop: true, armL: 1.2, lean: -0.35, wide: 0.95 });
        workFigure(95, 620, 1.15, 1);
        workFigure(175, 640, 1.05, 0);
        robeFigure(255, 600, 0.95, { armR: 0.8, lean: 0.08 });
        rainDashes(40, 700, 9);
        flora(300, 780, 1.1);
        flora(40, 800, 0.9);
      } else {
        // 右幅：中上执环杖群像，下部劳作群 + 花草雨丝
        robeFigure(130, 250, 1.45, { staff: true, armR: 0.3 });
        robeFigure(195, 270, 1.25, { armL: 0.6, lean: 0.06 });
        robeFigure(250, 255, 1.15, { armR: 0.9, lean: -0.05 });
        robeFigure(95, 290, 1.05, { lean: 0.12, wide: 0.9 });
        workFigure(100, 640, 1.1, 0);
        workFigure(175, 665, 1.0, 1);
        workFigure(250, 650, 1.05, 0);
        rainDashes(55, 720, 10);
        flora(55, 820, 1.2);
        flora(140, 835, 0.85);
        flora(230, 825, 1.0);
        flora(310, 815, 1.1);
      }

      const map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
      return map;
    }

    makeLacquerBoxStacks(counts = [5, 4, 3], spanZ = 1.1) {
      // 三列沿 Z（与柜门平行）；从 +Z→-Z 为 5、4、3；金锁朝走廊（-X）
      const g = new THREE.Group();
      const gap = 0.028;
      const boxFace = (spanZ - gap * (counts.length - 1)) / counts.length; // 沿 Z 的面宽
      const boxDepth = boxFace * 0.78; // 沿 X 进深
      const boxH = Math.max(0.085, boxFace * 0.42);
      const pitch = boxFace + gap;
      const startZ = ((counts.length - 1) * pitch) / 2;
      counts.forEach((n, i) => {
        const sz = startZ - i * pitch;
        for (let k = 0; k < n; k++) {
          const isTop = k === n - 1;
          // 几何：宽=面宽(将转到 Z)、深=进深(转到 X)
          const box = this.makeLacquerGiftBox(boxFace, boxDepth, boxH, isTop, i * 5 + k);
          box.position.set(0, boxH / 2 + k * (boxH + 0.001), sz);
          // 锁在局部 +Z；y=-90° 后朝世界 -X（走廊）
          box.rotation.y = -Math.PI / 2;
          g.add(box);
        }
      });
      return g;
    }

    makeLacquerGiftBox(w, d, h, withFloralTop = false, seed = 0) {
      // 对照实拍：小巧深红漆盒、正面圆金锁、顶盖白螺钿印花
      const g = new THREE.Group();
      // 提高反光，层与层更容易分辨
      const lacquer = this.mat(0x5c141c, null, { roughness: 0.12, metalness: 0.55 });
      const lacquerHi = this.mat(0x8a2430, null, { roughness: 0.1, metalness: 0.6 });
      const lacquerDeep = this.mat(0x2a080c, null, { roughness: 0.35, metalness: 0.25 });
      const gold = this.mat(0xe8c878, null, { metalness: 0.92, roughness: 0.18 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lacquer);
      g.add(body);
      // 盖线 + 层间暗缝（强化层数轮廓）
      const seam = new THREE.Mesh(new THREE.BoxGeometry(w * 0.97, 0.004, d * 0.97), lacquerHi);
      seam.position.y = h * 0.22;
      g.add(seam);
      const groove = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, 0.006, d * 1.01), lacquerDeep);
      groove.position.y = -h / 2 + 0.003;
      g.add(groove);
      // 圆金锁扣（偏正面中心略下）
      const lockY = -h * 0.02;
      const lockZ = d / 2 + 0.003;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(h * 0.28, 20), gold);
      disc.position.set(0, lockY, lockZ);
      g.add(disc);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(h * 0.2, h * 0.04, 6, 18), gold);
      rim.position.set(0, lockY, lockZ + 0.002);
      g.add(rim);
      // 锁鼻/搭扣
      const hasp = new THREE.Mesh(new THREE.BoxGeometry(h * 0.1, h * 0.28, 0.012), gold);
      hasp.position.set(0, lockY - h * 0.06, lockZ + 0.006);
      g.add(hasp);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(h * 0.06, 8, 8), gold);
      knob.position.set(0, lockY, lockZ + 0.01);
      g.add(knob);
      // 顶盖印花（螺钿白花）
      if (withFloralTop) {
        const map = this.makeLacquerBoxFloralTexture(seed);
        const top = new THREE.Mesh(
          new THREE.PlaneGeometry(w * 0.92, d * 0.88),
          new THREE.MeshStandardMaterial({
            map,
            roughness: 0.35,
            metalness: 0.2,
            transparent: true,
          })
        );
        top.rotation.x = -Math.PI / 2;
        top.position.y = h / 2 + 0.0012;
        g.add(top);
      } else {
        // 下层盒顶仅细微亮边
        const lidEdge = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.94, 0.002, d * 0.9),
          lacquerHi
        );
        lidEdge.position.y = h / 2;
        g.add(lidEdge);
      }
      return g;
    }

    makeLacquerBoxFloralTexture(seed = 0) {
      // 深红底 + 白/浅金螺钿花叶（对照实拍顶面）
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = 256;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#4a1014";
      ctx.fillRect(0, 0, 320, 256);
      const petal = (x, y, s, rot, col) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.scale(s, s);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.quadraticCurveTo(10, -4, 8, 8);
        ctx.quadraticCurveTo(0, 2, -8, 8);
        ctx.quadraticCurveTo(-10, -4, 0, -12);
        ctx.fill();
        ctx.restore();
      };
      const flower = (x, y, s) => {
        for (let i = 0; i < 6; i++) {
          petal(x, y, s, (i / 6) * Math.PI * 2, i % 2 ? "#f2e8d4" : "#e8d8b0");
        }
        ctx.fillStyle = "#d4b060";
        ctx.beginPath();
        ctx.arc(x, y, 3.2 * s, 0, Math.PI * 2);
        ctx.fill();
      };
      const vine = (x0, y0, x1, y1) => {
        ctx.strokeStyle = "rgba(236,220,190,0.75)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - 20, x1, y1);
        ctx.stroke();
      };
      flower(70 + (seed % 4) * 4, 70, 1.35);
      flower(170, 50, 1.1);
      flower(240, 110, 1.25);
      flower(120, 150, 0.95);
      flower(210, 180, 1.05);
      vine(40, 200, 280, 60);
      vine(60, 40, 260, 200);
      // 碎点螺钿
      ctx.fillStyle = "rgba(245,235,210,0.7)";
      for (let i = 0; i < 18; i++) {
        ctx.beginPath();
        ctx.arc((seed * 13 + i * 47) % 300 + 10, (seed * 7 + i * 31) % 230 + 10, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      const map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
      return map;
    }

    makeTenonPaintBoardRack(len, wid, height, layers = 7) {
      // 榫卯感方木叠架：每层插一块红漆边画板；局部长 X、宽 Z
      const g = new THREE.Group();
      const wood = this.mat(0xc4a882, null, { roughness: 0.72, metalness: 0.04 });
      const woodDeep = this.mat(0xa88860, null, { roughness: 0.68, metalness: 0.05 });
      const redEdge = this.mat(0x8b1a1a, null, { roughness: 0.38, metalness: 0.12 });
      const post = 0.09;
      const boardT = 0.045;
      const slot = 0.012; // 板与方木间隙
      const layerPitch = height / layers;
      const blockH = Math.max(0.055, layerPitch - boardT - slot);
      const boardLen = len - post * 0.3;
      const boardWid = wid - post * 1.6;

      // 四角立柱：分段方木叠垒（榫卯感）
      const corners = [
        [-len / 2 + post / 2, -wid / 2 + post / 2],
        [len / 2 - post / 2, -wid / 2 + post / 2],
        [-len / 2 + post / 2, wid / 2 - post / 2],
        [len / 2 - post / 2, wid / 2 - post / 2],
      ];
      for (const [px, pz] of corners) {
        for (let i = 0; i < layers; i++) {
          const y0 = i * layerPitch;
          const blk = new THREE.Mesh(new THREE.BoxGeometry(post, blockH, post), i % 2 ? woodDeep : wood);
          blk.position.set(px, y0 + blockH / 2, pz);
          g.add(blk);
          // 层间短榫头
          if (i < layers - 1) {
            const tenon = new THREE.Mesh(
              new THREE.BoxGeometry(post * 0.45, slot + boardT * 0.3, post * 0.45),
              woodDeep
            );
            tenon.position.set(px, y0 + blockH + (slot + boardT * 0.3) / 2, pz);
            g.add(tenon);
          }
        }
        // 顶帽
        const cap = new THREE.Mesh(new THREE.BoxGeometry(post * 1.15, 0.04, post * 1.15), woodDeep);
        cap.position.set(px, height + 0.02, pz);
        g.add(cap);
      }

      // 前后横向拉档（每两层一道）
      for (let i = 0; i < layers; i += 2) {
        const y = i * layerPitch + blockH * 0.55;
        for (const pz of [-wid / 2 + post / 2, wid / 2 - post / 2]) {
          const rail = new THREE.Mesh(
            new THREE.BoxGeometry(len - post * 1.2, post * 0.45, post * 0.55),
            wood
          );
          rail.position.set(0, y, pz);
          g.add(rail);
        }
      }

      // 各层画板
      for (let i = 0; i < layers; i++) {
        const y = i * layerPitch + blockH + slot + boardT / 2;
        const board = this.makePaintedLacquerBoard(boardLen, boardWid, boardT, redEdge, i);
        // 略错位，更自然
        board.position.set((i % 2) * 0.03 - 0.01, y, (i % 3) * 0.02 - 0.02);
        board.rotation.y = ((i % 2) * 2 - 1) * 0.015;
        g.add(board);
      }

      // 底托
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(len * 0.95, 0.03, wid * 0.95),
        woodDeep
      );
      base.position.y = 0.015;
      g.add(base);
      return g;
    }

    makePaintedLacquerBoard(len, wid, thick, redEdge, seed = 0) {
      const g = new THREE.Group();
      const faceMap = this.makePaintBoardFaceTexture(seed);
      const face = new THREE.MeshStandardMaterial({
        map: faceMap,
        roughness: 0.55,
        metalness: 0.08,
      });
      const core = new THREE.Mesh(new THREE.BoxGeometry(len, thick * 0.7, wid - 0.02), face);
      g.add(core);
      // 四周红漆边
      const e = 0.012;
      const longEdge = new THREE.BoxGeometry(len, thick, e);
      for (const sz of [-1, 1]) {
        const edge = new THREE.Mesh(longEdge, redEdge);
        edge.position.set(0, 0, sz * (wid / 2 - e / 2));
        g.add(edge);
      }
      const shortEdge = new THREE.BoxGeometry(e, thick, wid);
      for (const sx of [-1, 1]) {
        const edge = new THREE.Mesh(shortEdge, redEdge);
        edge.position.set(sx * (len / 2 - e / 2), 0, 0);
        g.add(edge);
      }
      // 顶面略凸的画面层
      const paint = new THREE.Mesh(
        new THREE.BoxGeometry(len - 0.04, 0.006, wid - 0.03),
        face
      );
      paint.position.y = thick * 0.35;
      g.add(paint);
      return g;
    }

    makePaintBoardFaceTexture(seed = 0) {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 160;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#3a3a3c";
      ctx.fillRect(0, 0, c.width, c.height);
      // 深灰底上不规则金赭色色块（对照实拍半成品画板）
      const blobs = 5 + (seed % 3);
      for (let i = 0; i < blobs; i++) {
        const x = 20 + ((seed * 37 + i * 53) % 200);
        const y = 15 + ((seed * 19 + i * 41) % 120);
        const rx = 28 + ((seed + i * 7) % 40);
        const ry = 18 + ((seed + i * 11) % 30);
        ctx.fillStyle = i % 2 ? "#c4a060" : "#d8b878";
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, ((seed + i) % 5) * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(90,70,40,0.25)";
        ctx.beginPath();
        ctx.ellipse(x + 6, y + 4, rx * 0.6, ry * 0.55, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // 细裂纹/笔触
      ctx.strokeStyle = "rgba(200,170,100,0.35)";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(10 + i * 40, 10 + ((seed + i) % 20));
        ctx.bezierCurveTo(
          40 + i * 30,
          40 + seed * 3,
          80 + i * 20,
          100 - i * 8,
          120 + i * 15,
          140
        );
        ctx.stroke();
      }
      const map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
      return map;
    }

    makeFiveBayPoemCabinet(w, d, h) {
      // 五列：左右实木诗句门，中三列上 4/5 玻璃门 + 下 1/5 固定裙板；局部 +Z 为正面
      const g = new THREE.Group();
      const wood = this.mat(0x4a2418, null, { roughness: 0.32, metalness: 0.18 });
      const woodDeep = this.mat(0x2a1410, null, { roughness: 0.36, metalness: 0.14 });
      const woodHi = this.mat(0x6a3830, null, { roughness: 0.26, metalness: 0.22 });
      const metal = this.mat(0xc8ced4, null, { metalness: 0.82, roughness: 0.28 });
      const glass = this.mat(0xd8e8f0, null, {
        metalness: 0.04,
        roughness: 0.06,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
      });
      const shelfMat = this.mat(0x5a3228, null, { roughness: 0.55, metalness: 0.08 });
      const paper = this.mat(0xf0ece4, null, { roughness: 0.88 });
      const boxMat = this.mat(0xd8d0c4, null, { roughness: 0.75 });
      const boxGray = this.mat(0xb8b4ac, null, { roughness: 0.72 });
      const boxBrown = this.mat(0x8a6a48, null, { roughness: 0.7 });
      const plateMat = this.mat(0xf4f2ee, null, { roughness: 0.35, metalness: 0.08 });

      const t = 0.06;
      const face = d / 2;
      const frontZ = face - 0.015;
      const plinthH = 0.08;

      // 柜体壳
      const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), woodDeep);
      back.position.set(0, h / 2, -d / 2 + t / 2);
      g.add(back);
      for (const sx of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(t, h, d), wood);
        side.position.set(sx * (w / 2 - t / 2), h / 2, 0);
        g.add(side);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.07, d + 0.04), woodHi);
      top.position.set(0, h + 0.01, 0.01);
      g.add(top);
      const bottom = new THREE.Mesh(new THREE.BoxGeometry(w - t, t, d - t), wood);
      bottom.position.set(0, plinthH + t / 2, 0);
      g.add(bottom);
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, plinthH, d + 0.03), woodDeep);
      plinth.position.set(0, plinthH / 2, 0);
      g.add(plinth);

      const cols = 5;
      const gap = 0.018;
      const innerW = w - t * 2;
      const colW = (innerW - gap * (cols + 1)) / cols;
      const doorBot = plinthH + 0.04;
      const doorTop = h - 0.06;
      const doorH = doorTop - doorBot;
      const frameT = Math.max(0.028, colW * 0.07);
      const glassFrac = 0.8; // 上五分之四玻璃
      const poems = ["月照青山松柏香", "风静幽窗心自默"];

      for (let c = 0; c < cols; c++) {
        const dx = -innerW / 2 + gap + colW / 2 + c * (colW + gap);
        const isSolid = c === 0 || c === cols - 1;

        // 列间竖框
        if (c < cols - 1) {
          const seam = new THREE.Mesh(new THREE.BoxGeometry(gap, doorH + 0.04, 0.055), woodHi);
          seam.position.set(dx + colW / 2 + gap / 2, doorBot + doorH / 2, frontZ - 0.01);
          g.add(seam);
        }

        if (isSolid) {
          const door = new THREE.Mesh(new THREE.BoxGeometry(colW, doorH, 0.045), woodDeep);
          door.position.set(dx, doorBot + doorH / 2, frontZ);
          g.add(door);
          this.addCabinetMolding(g, dx, doorBot + doorH / 2, frontZ + 0.025, colW - 0.04, doorH - 0.04, woodHi, frameT * 0.7);
          const poem = poems[c === 0 ? 0 : 1];
          const poemPlane = this.makeVerticalPoemPlane(poem, colW * 0.68, doorH * 0.86);
          poemPlane.position.set(dx, doorBot + doorH * 0.5, frontZ + 0.028);
          g.add(poemPlane);
          // 银色竖长把手（靠内侧）
          const handleSide = c === 0 ? 1 : -1;
          const handle = new THREE.Mesh(
            new THREE.BoxGeometry(0.018, doorH * 0.28, 0.028),
            metal
          );
          handle.position.set(
            dx + handleSide * (colW * 0.32),
            doorBot + doorH * 0.42,
            frontZ + 0.04
          );
          g.add(handle);
        } else {
          const glassH = doorH * glassFrac;
          const skirtH = doorH * (1 - glassFrac);
          const glassY = doorBot + skirtH + glassH / 2;
          const skirtY = doorBot + skirtH / 2;

          // 下裙板（固定、不开）
          const skirt = new THREE.Mesh(new THREE.BoxGeometry(colW, skirtH - 0.01, 0.045), woodDeep);
          skirt.position.set(dx, skirtY, frontZ);
          g.add(skirt);
          this.addCabinetMolding(
            g,
            dx,
            skirtY,
            frontZ + 0.022,
            colW - 0.035,
            skirtH - 0.03,
            woodHi,
            frameT * 0.55
          );

          // 玻璃门：仅木边框（不封实心板）+ 玻璃 + 内景
          const insetW = colW - frameT * 2;
          const insetH = glassH - frameT * 2;
          const fw = frameT;
          const fz = frontZ + 0.02;
          // 上下左右框条
          const topF = new THREE.Mesh(new THREE.BoxGeometry(colW, fw, 0.045), wood);
          topF.position.set(dx, glassY + glassH / 2 - fw / 2, fz);
          g.add(topF);
          const botF = new THREE.Mesh(new THREE.BoxGeometry(colW, fw, 0.045), wood);
          botF.position.set(dx, glassY - glassH / 2 + fw / 2, fz);
          g.add(botF);
          for (const sx of [-1, 1]) {
            const sideF = new THREE.Mesh(
              new THREE.BoxGeometry(fw, glassH - fw * 2, 0.045),
              wood
            );
            sideF.position.set(dx + sx * (colW / 2 - fw / 2), glassY, fz);
            g.add(sideF);
          }
          // 外沿压线
          this.addCabinetMolding(g, dx, glassY, fz + 0.02, colW - 0.01, glassH - 0.01, woodHi, fw * 0.45);

          // 内景：背板 + 隔板 + 卷宗/纸盒
          const innerD = d - t - 0.08;
          const backInner = new THREE.Mesh(
            new THREE.BoxGeometry(insetW * 0.96, insetH * 0.96, 0.02),
            woodDeep
          );
          backInner.position.set(dx, glassY, -d / 2 + t + 0.03);
          g.add(backInner);

          const shelfN = 4;
          for (let s = 0; s < shelfN; s++) {
            const sy = glassY - insetH / 2 + insetH * ((s + 0.5) / shelfN);
            const shelf = new THREE.Mesh(
              new THREE.BoxGeometry(insetW * 0.92, 0.018, innerD * 0.85),
              shelfMat
            );
            shelf.position.set(dx, sy, -d / 2 + t + 0.04 + (innerD * 0.85) / 2);
            g.add(shelf);
            this.fillCabinetShelfProps(
              g,
              dx,
              sy + 0.01,
              -d / 2 + t + 0.12,
              insetW * 0.85,
              innerD * 0.55,
              s + c * 3,
              { paper, boxMat, boxGray, boxBrown, plateMat, woodDeep }
            );
          }

          const pane = new THREE.Mesh(new THREE.BoxGeometry(insetW, insetH, 0.012), glass);
          pane.position.set(dx, glassY, fz + 0.01);
          g.add(pane);

          // 竖把手
          const handle = new THREE.Mesh(
            new THREE.BoxGeometry(0.016, glassH * 0.32, 0.026),
            metal
          );
          handle.position.set(dx + colW * 0.3, glassY - glassH * 0.05, fz + 0.03);
          g.add(handle);
        }
      }

      // 左右前立柱
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, h - plinthH, 0.06), woodHi);
        post.position.set(sx * (w / 2 - 0.04), plinthH + (h - plinthH) / 2, frontZ - 0.01);
        g.add(post);
      }
      return g;
    }

    makeVerticalPoemPlane(text, w, h) {
      // 草书竖排金字：字更大，笔势更连、更斜，仍尽量可辨
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 900;
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#e0b45a";
      ctx.strokeStyle = "#c4943a";
      ctx.lineWidth = 5.5;
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      // 草书字体；描边叠绘加粗（该字体本身无 bold）
      ctx.font =
        "108px 'Liu Jian Mao Cao','Xingkai SC','STXingkai','Kaiti SC','STKaiti',cursive,serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const chars = [...text];
      const step = (c.height * 0.9) / chars.length;
      const startY = c.height * 0.05 + step / 2;
      for (let i = 0; i < chars.length; i++) {
        const y = startY + i * step;
        // 仅轻微错落，几乎不倾斜
        const ox = Math.sin(i * 0.9) * 4;
        const rot = ((i % 2 === 0 ? -1 : 1) * 0.02);
        ctx.save();
        ctx.translate(c.width / 2 + ox, y);
        ctx.rotate(rot);
        ctx.strokeText(chars[i], 0, 0);
        ctx.strokeText(chars[i], 0.5, 0.5);
        ctx.fillText(chars[i], 0, 0);
        ctx.fillText(chars[i], 0.6, 0);
        ctx.restore();
      }
      const map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
      const mat = new THREE.MeshStandardMaterial({
        map,
        transparent: true,
        roughness: 0.42,
        metalness: 0.4,
        depthWrite: false,
      });
      return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    }

    fillCabinetShelfProps(g, x, y, z, maxW, maxD, shelfIndex, mats) {
      const { paper, boxMat, boxGray, boxBrown, plateMat, woodDeep } = mats;
      // 纸卷
      for (let i = 0; i < 2 + (shelfIndex % 2); i++) {
        const roll = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035 + (i % 2) * 0.01, 0.035 + (i % 2) * 0.01, 0.16 + i * 0.02, 10),
          paper
        );
        roll.rotation.z = Math.PI / 2;
        roll.position.set(x - maxW * 0.28 + i * 0.12, y + 0.04, z + 0.02 + i * 0.03);
        g.add(roll);
      }
      // 纸盒
      const boxes = [
        [0.14, 0.07, 0.1, boxMat, 0.12],
        [0.11, 0.09, 0.09, boxGray, -0.02],
        [0.09, 0.06, 0.08, boxBrown, -0.18],
      ];
      for (let i = 0; i < boxes.length; i++) {
        if (shelfIndex === 0 && i === 2) continue;
        const [bw, bh, bd, mat, ox] = boxes[i];
        const box = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
        box.position.set(x + ox + maxW * 0.08, y + bh / 2, z + 0.05 + (i % 2) * 0.04);
        box.rotation.y = (i - 1) * 0.12;
        g.add(box);
      }
      // 中间列某层放白盘
      if (shelfIndex === 2) {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 20), plateMat);
        plate.position.set(x + 0.02, y + 0.05, z + 0.08);
        g.add(plate);
        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(0.085, 0.006, 6, 20),
          plateMat
        );
        rim.rotation.x = Math.PI / 2;
        rim.position.set(x + 0.02, y + 0.056, z + 0.08);
        g.add(rim);
      }
      // 小罐
      if (shelfIndex % 2 === 1) {
        const jar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.035, 0.08, 10),
          woodDeep
        );
        jar.position.set(x + maxW * 0.28, y + 0.045, z + 0.06);
        g.add(jar);
      }
      // 叠放卷宗薄片
      for (let i = 0; i < 3; i++) {
        const sheet = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.012, 0.08),
          i % 2 ? paper : boxGray
        );
        sheet.position.set(x - maxW * 0.05, y + 0.02 + i * 0.014, z + maxD * 0.15);
        sheet.rotation.y = 0.15 + i * 0.05;
        g.add(sheet);
      }
    }

    makeChineseSideCabinet(w, d, h) {
      // 局部 +Z 为朝走廊正面：上 2/3 柜门、下 1/3 双层抽屉
      const g = new THREE.Group();
      // 提高反光，深色漆面才能看清棱线
      const frame = this.mat(0x4a2c24, null, { roughness: 0.28, metalness: 0.22 });
      const panel = this.mat(0x2e1814, null, { roughness: 0.32, metalness: 0.18 });
      const panelHi = this.mat(0x6a4034, null, { roughness: 0.22, metalness: 0.28 });
      const gapMat = this.mat(0x120a08, null, { roughness: 0.75, metalness: 0.05 });
      const metal = this.mat(0xd4b06a, null, { metalness: 0.85, roughness: 0.22 });

      const t = 0.07;
      const face = d / 2; // 正面 z

      // 背板、顶、底、两侧（前面开口）
      const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), frame);
      back.position.set(0, h / 2, -d / 2 + t / 2);
      g.add(back);
      const left = new THREE.Mesh(new THREE.BoxGeometry(t, h, d), frame);
      left.position.set(-w / 2 + t / 2, h / 2, 0);
      g.add(left);
      const right = new THREE.Mesh(new THREE.BoxGeometry(t, h, d), frame);
      right.position.set(w / 2 - t / 2, h / 2, 0);
      g.add(right);
      const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.08, d + 0.06), panelHi);
      top.position.set(0, h + 0.02, 0.01);
      g.add(top);
      const bottom = new THREE.Mesh(new THREE.BoxGeometry(w - t, t, d - t), frame);
      bottom.position.set(0, t / 2 + 0.02, 0);
      g.add(bottom);
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.1, d + 0.04), gapMat);
      plinth.position.set(0, 0.05, 0);
      g.add(plinth);

      const drawerH = h / 3;
      const doorH = h - drawerH;
      const cols = 6;
      const gap = 0.022;
      const frontZ = face - 0.02;
      const innerW = w - t * 2;
      const colW = (innerW - gap * (cols + 1)) / cols;

      // 前脸暗缝底板（衬托门缝）
      const faceBack = new THREE.Mesh(new THREE.BoxGeometry(innerW, h - 0.16, 0.03), gapMat);
      faceBack.position.set(0, h / 2, frontZ - 0.04);
      g.add(faceBack);

      // 门与抽屉分隔横档
      const belt = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.06, 0.07), panelHi);
      belt.position.set(0, drawerH + 0.02, frontZ);
      g.add(belt);

      const dH = doorH - 0.12;
      const dY = drawerH + 0.08 + dH / 2;
      const rowGap = 0.028;
      const rowH = (drawerH - 0.16 - rowGap) / 2;
      const mold = Math.max(0.028, colW * 0.06);
      const ringR = Math.max(0.045, Math.min(0.07, colW * 0.12));

      // 六列：上柜门 + 下双层抽屉一一对应
      for (let c = 0; c < cols; c++) {
        const dx = -innerW / 2 + gap + colW / 2 + c * (colW + gap);

        // 上：竖柜门
        const door = new THREE.Mesh(new THREE.BoxGeometry(colW, dH, 0.05), panel);
        door.position.set(dx, dY, frontZ);
        g.add(door);
        this.addCabinetMolding(g, dx, dY, frontZ + 0.03, colW - 0.05, dH - 0.05, panelHi, mold);
        const doorCore = new THREE.Mesh(
          new THREE.BoxGeometry(colW - mold * 3.2, dH - mold * 3.2, 0.02),
          panel
        );
        doorCore.position.set(dx, dY, frontZ + 0.015);
        g.add(doorCore);
        const handle = this.makeCabinetRingHandle(metal, ringR);
        handle.position.set(dx, dY, frontZ + 0.055);
        g.add(handle);

        // 下：该列双层抽屉
        for (let row = 0; row < 2; row++) {
          const y = 0.12 + rowH / 2 + row * (rowH + rowGap);
          const drawer = new THREE.Mesh(new THREE.BoxGeometry(colW, rowH, 0.05), panel);
          drawer.position.set(dx, y, frontZ);
          g.add(drawer);
          this.addCabinetMolding(g, dx, y, frontZ + 0.03, colW - 0.05, rowH - 0.04, panelHi, mold * 0.85);
          const core = new THREE.Mesh(
            new THREE.BoxGeometry(colW - mold * 3, rowH - mold * 2.4, 0.02),
            panel
          );
          core.position.set(dx, y, frontZ + 0.015);
          g.add(core);
          const barW = Math.max(0.12, colW * 0.45);
          const bar = new THREE.Mesh(new THREE.BoxGeometry(barW, 0.025, 0.035), metal);
          bar.position.set(dx, y, frontZ + 0.06);
          g.add(bar);
          for (const sx of [-barW * 0.38, barW * 0.38]) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.045, 8), metal);
            post.rotation.x = Math.PI / 2;
            post.position.set(dx + sx, y, frontZ + 0.045);
            g.add(post);
          }
        }

        // 列间竖缝
        if (c < cols - 1) {
          const seamX = dx + colW / 2 + gap / 2;
          const seam = new THREE.Mesh(new THREE.BoxGeometry(gap, h - 0.2, 0.055), gapMat);
          seam.position.set(seamX, h / 2, frontZ);
          g.add(seam);
        }
      }

      // 前脸左右立柱棱角
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, h - 0.12, 0.08), panelHi);
        post.position.set(sx * (w / 2 - 0.05), h / 2, frontZ - 0.01);
        g.add(post);
      }

      return g;
    }

    addCabinetMolding(g, x, y, z, w, h, mat, tw = 0.02) {
      const top = new THREE.Mesh(new THREE.BoxGeometry(w, tw, tw), mat);
      top.position.set(x, y + h / 2 - tw / 2, z);
      g.add(top);
      const bot = new THREE.Mesh(new THREE.BoxGeometry(w, tw, tw), mat);
      bot.position.set(x, y - h / 2 + tw / 2, z);
      g.add(bot);
      const left = new THREE.Mesh(new THREE.BoxGeometry(tw, h, tw), mat);
      left.position.set(x - w / 2 + tw / 2, y, z);
      g.add(left);
      const right = new THREE.Mesh(new THREE.BoxGeometry(tw, h, tw), mat);
      right.position.set(x + w / 2 - tw / 2, y, z);
      g.add(right);
    }

    makeCabinetRingHandle(metal, radius = 0.06) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.18, 8, 20), metal);
      g.add(ring);
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(radius * 0.5, radius * 2.2, radius * 0.8),
        metal
      );
      plate.position.z = -radius * 0.3;
      g.add(plate);
      return g;
    }

    buildCyanPanelOuterWalls(H) {
      // 对照图下半：白边框 + 浅青蓝竖向长方形，自上而下一整块并排拼接
      const cyan = this.mat(0xa8c4c8, null, { roughness: 0.78, metalness: 0.02 });
      const frame = this.mat(0xf5f7f8, null, { roughness: 0.55, metalness: 0.04 });

      this.buildCyanWallFace({ axis: "x", cx: 0, cz: -8.9, length: 29.8, H, cyan, frame });
      this.buildCyanWallFace({ axis: "x", cx: 0, cz: 8.9, length: 29.8, H, cyan, frame });
      this.buildCyanWallFace({ axis: "z", cx: -14.9, cz: 0, length: 17.5, H, cyan, frame });
      this.buildCyanWallFace({ axis: "z", cx: 14.9, cz: 0, length: 17.5, H, cyan, frame });
    }

    buildCeilingLEDLights(H) {
      // 常见长条日光灯：灯盘 + 发光灯管，网格均布
      const housing = this.mat(0xe6e8ea, null, { roughness: 0.55, metalness: 0.08 });
      const endCap = this.mat(0xd0d3d6, null, { roughness: 0.5 });
      const tubeMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xf4f7ff,
        emissiveIntensity: 1.35,
        roughness: 0.25,
        metalness: 0.0,
      });

      const xs = [-11.5, -6.9, -2.3, 2.3, 6.9, 11.5];
      const zs = [-6.2, -3.1, 0, 3.1, 6.2];
      const yFix = H - 0.05;

      for (const x of xs) {
        for (const z of zs) {
          const g = new THREE.Group();
          // 灯盘
          const tray = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.035, 0.2), housing);
          g.add(tray);
          // 灯管
          const tube = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 1.15, 4, 8), tubeMat);
          tube.rotation.z = Math.PI / 2;
          tube.position.y = -0.03;
          g.add(tube);
          // 两端卡扣
          for (const sx of [-0.68, 0.68]) {
            const cap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.16), endCap);
            cap.position.set(sx, -0.02, 0);
            g.add(cap);
          }
          g.position.set(x, yFix, z);
          this.scene.add(g);

          // 柔和下射
          const pl = new THREE.PointLight(0xf3f6ff, 0.42, 8.5, 2);
          pl.position.set(x, H - 0.45, z);
          this.scene.add(pl);
        }
      }
    }

    buildCeilingWallJunction(H) {
      // 参考实景：白色天花 + 墙顶白色收口梁 + 转角白柱，衔接干净
      const white = this.mat(0xffffff, null, { roughness: 0.52, metalness: 0.02 });
      const whiteSoft = this.mat(0xf3f3f3, null, { roughness: 0.72 });
      const beamH = 0.18;
      const beamD = 0.26;
      const y = H - beamH / 2;
      const zN = -8.9;
      const zS = 8.9;
      const xW = -14.9;
      const xE = 14.9;

      // 四面顶梁（向室内挑出）
      this.box(30.4, beamH, beamD, white, 0, y, zN + beamD / 2 + 0.04, false);
      this.box(30.4, beamH, beamD, white, 0, y, zS - beamD / 2 - 0.04, false);
      this.box(beamD, beamH, 18.2, white, xW + beamD / 2 + 0.04, y, 0, false);
      this.box(beamD, beamH, 18.2, white, xE - beamD / 2 - 0.04, y, 0, false);

      // 梁下沿细压线
      const lipH = 0.04;
      const lipY = H - beamH - lipH / 2;
      this.box(30.2, lipH, 0.06, whiteSoft, 0, lipY, zN + 0.2, false);
      this.box(30.2, lipH, 0.06, whiteSoft, 0, lipY, zS - 0.2, false);
      this.box(0.06, lipH, 18, whiteSoft, xW + 0.2, lipY, 0, false);
      this.box(0.06, lipH, 18, whiteSoft, xE - 0.2, lipY, 0, false);

      // 四角白色转角柱（墙与天花交汇）
      const postW = 0.16;
      for (const [x, z] of [
        [xW + 0.12, zN + 0.12],
        [xW + 0.12, zS - 0.12],
        [xE - 0.12, zN + 0.12],
        [xE - 0.12, zS - 0.12],
      ]) {
        this.box(postW, H, postW, white, x, H / 2, z, false);
        // 柱顶与梁齐平的小帽
        this.box(postW + 0.04, 0.06, postW + 0.04, whiteSoft, x, H - 0.03, z, false);
      }
    }

    buildCyanWallFace({ axis, cx, cz, length, H, cyan, frame }) {
      const panelW = 1.05;
      const frameW = 0.06;
      const thick = 0.07;
      const frameDepth = 0.12;
      const cornice = 0.2; // 顶部留给白色收口梁
      const wallH = H - cornice;
      const pitch = panelW + frameW;
      const cols = Math.max(1, Math.round(length / pitch));
      const usedW = cols * pitch + frameW;
      const start = -usedW / 2 + frameW + panelW / 2;
      const panelH = wallH - frameW * 2;
      const frameHi = this.mat(0xffffff, null, { roughness: 0.42, metalness: 0.06 });

      if (axis === "x") {
        this.colliders.push({
          minX: cx - usedW / 2,
          maxX: cx + usedW / 2,
          minZ: cz - 0.14,
          maxZ: cz + 0.14,
        });
      } else {
        this.colliders.push({
          minX: cx - 0.14,
          maxX: cx + 0.14,
          minZ: cz - usedW / 2,
          maxZ: cz + usedW / 2,
        });
      }

      // 底板（高度止于收口梁下）
      const back = new THREE.Mesh(
        new THREE.BoxGeometry(
          axis === "x" ? usedW : thick * 0.5,
          wallH,
          axis === "x" ? thick * 0.5 : usedW
        ),
        frame
      );
      back.position.set(cx, wallH / 2, cz);
      this.scene.add(back);

      // 上下通长白框
      for (const y of [frameW / 2, wallH - frameW / 2]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(
            axis === "x" ? usedW : frameDepth,
            frameW,
            axis === "x" ? frameDepth : usedW
          ),
          frameHi
        );
        rail.position.set(cx, y, cz);
        this.scene.add(rail);
      }

      for (let c = 0; c < cols; c++) {
        const along = start + c * pitch;

        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(
            axis === "x" ? panelW : thick,
            panelH,
            axis === "x" ? thick : panelW
          ),
          cyan
        );
        if (axis === "x") panel.position.set(cx + along, wallH / 2, cz);
        else panel.position.set(cx, wallH / 2, cz + along);
        this.scene.add(panel);

        for (const side of [-1, 1]) {
          const mullion = new THREE.Mesh(
            new THREE.BoxGeometry(
              axis === "x" ? frameW : frameDepth,
              wallH,
              axis === "x" ? frameDepth : frameW
            ),
            frameHi
          );
          const off = along + side * (panelW / 2 + frameW / 2);
          if (axis === "x") mullion.position.set(cx + off, wallH / 2, cz);
          else mullion.position.set(cx, wallH / 2, cz + off);
          this.scene.add(mullion);
        }
      }
    }

    buildLacquerCorridorWalls(H) {
      // 左右各一道：圆柱立柱 + 上部凹格 + 中部玻璃（回纹角饰）+ 下部裙板
      const lacquer = this.mat(0x5c1a24, null, { metalness: 0.22, roughness: 0.32 });
      const lacquerDeep = this.mat(0x3e1018, null, { metalness: 0.18, roughness: 0.4 });
      const glass = this.mat(0xc8dde8, null, {
        metalness: 0.05,
        roughness: 0.08,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
      });
      const etch = this.mat(0xf2f4f6, null, { roughness: 0.55, metalness: 0.02 });

      const doorHalf = 1.05; // 门洞半宽，与 makeDoor 1.7 叶宽留缝
      const zMin = -8.55;
      const zMax = 8.55;
      const wallXs = [-3.5, 3.5];

      for (const x of wallXs) {
        // 门两侧墙段
        this.buildLacquerWallSpan(x, zMin, -doorHalf, H, lacquer, lacquerDeep, glass, etch);
        this.buildLacquerWallSpan(x, doorHalf, zMax, H, lacquer, lacquerDeep, glass, etch);
        // 门洞上下框（保留通行，补上门楣/门槛）
        this.addLacquerDoorPortal(x, H, doorHalf, lacquer, lacquerDeep);
      }
    }

    buildLacquerWallSpan(x, z0, z1, H, lacquer, lacquerDeep, glass, etch) {
      const span = z1 - z0;
      if (span < 0.4) return;
      const bayCount = Math.max(1, Math.round(span / 2.35));
      const bayW = span / bayCount;
      const thick = 0.16;
      const colR = 0.11;
      const lowerH = 0.82;
      const winBot = lowerH;
      const winTop = 2.38;
      const friezeBot = winTop;
      const friezeTop = H - 0.08;

      for (let i = 0; i < bayCount; i++) {
        const zA = z0 + i * bayW;
        const zB = zA + bayW;
        const zC = (zA + zB) / 2;

        // 立柱（圆柱）
        const col = new THREE.Mesh(
          new THREE.CylinderGeometry(colR, colR, H - 0.04, 16),
          lacquer
        );
        col.position.set(x, H / 2, zA);
        this.scene.add(col);
        if (i === bayCount - 1) {
          const colEnd = new THREE.Mesh(
            new THREE.CylinderGeometry(colR, colR, H - 0.04, 16),
            lacquer
          );
          colEnd.position.set(x, H / 2, zB);
          this.scene.add(colEnd);
        }

        const innerW = bayW - colR * 2 - 0.04;

        // 顶梁
        this.box(thick + 0.04, 0.1, innerW + 0.08, lacquer, x, H - 0.05, zC, false);
        // 窗上下横梁
        this.box(thick, 0.09, innerW, lacquer, x, winTop + 0.04, zC, false);
        this.box(thick, 0.09, innerW, lacquer, x, winBot - 0.04, zC, false);

        // 上部三格凹板
        const panelH = friezeTop - friezeBot - 0.06;
        const panelY = (friezeBot + friezeTop) / 2;
        for (let p = 0; p < 3; p++) {
          const pw = innerW / 3 - 0.04;
          const pz = zC - innerW / 2 + innerW / 6 + p * (innerW / 3);
          // 外框
          this.box(thick * 0.7, panelH, pw + 0.04, lacquer, x, panelY, pz, false);
          // 凹心
          this.box(thick * 0.35, panelH - 0.06, pw - 0.02, lacquerDeep, x + (x > 0 ? -0.02 : 0.02), panelY, pz, false);
        }

        // 下部裙板
        this.box(thick * 0.85, lowerH - 0.08, innerW, lacquer, x, lowerH / 2, zC, false);
        this.box(thick * 0.4, lowerH - 0.18, innerW - 0.1, lacquerDeep, x + (x > 0 ? -0.02 : 0.02), lowerH / 2 + 0.02, zC, false);

        // 玻璃
        const winH = winTop - winBot - 0.06;
        const winY = (winBot + winTop) / 2;
        const pane = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, winH, innerW - 0.06),
          glass
        );
        pane.position.set(x, winY, zC);
        this.scene.add(pane);
        // 碰撞（防穿玻璃）
        this.colliders.push({
          minX: x - 0.12,
          maxX: x + 0.12,
          minZ: zA + 0.05,
          maxZ: zB - 0.05,
        });

        // 玻璃回纹角饰（白线）
        this.addGlassFretCorners(x, winY, zC, winH, innerW - 0.06, etch);
      }
    }

    addGlassFretCorners(x, y, z, h, w, etch) {
      // 四角回纹：短折线框
      const t = 0.012;
      const m = 0.07; // 距边
      const arm = 0.16;
      const inset = 0.06;
      const face = x > 0 ? -0.03 : 0.03;
      const corners = [
        { sx: 1, sy: 1 },
        { sx: 1, sy: -1 },
        { sx: -1, sy: 1 },
        { sx: -1, sy: -1 },
      ];
      // 这里 sx 对应 Z 方向，sy 对应 Y
      for (const c of corners) {
        const cz = z + c.sx * (w / 2 - m);
        const cy = y + c.sy * (h / 2 - m);
        // 横折
        const hz = new THREE.Mesh(new THREE.BoxGeometry(t, t, arm), etch);
        hz.position.set(x + face, cy - c.sy * inset, cz - c.sx * (arm / 2 - t));
        this.scene.add(hz);
        // 竖折
        const vt = new THREE.Mesh(new THREE.BoxGeometry(t, arm, t), etch);
        vt.position.set(x + face, cy - c.sy * (arm / 2 - t), cz - c.sx * inset);
        this.scene.add(vt);
        // 内角短边
        const hz2 = new THREE.Mesh(new THREE.BoxGeometry(t, t, arm * 0.45), etch);
        hz2.position.set(x + face, cy - c.sy * (inset + arm * 0.35), cz - c.sx * (arm * 0.35));
        this.scene.add(hz2);
        const vt2 = new THREE.Mesh(new THREE.BoxGeometry(t, arm * 0.45, t), etch);
        vt2.position.set(x + face, cy - c.sy * (arm * 0.35), cz - c.sx * (inset + arm * 0.35));
        this.scene.add(vt2);
      }
      // 贴近窗边的细边线
      const edgeY = h / 2 - 0.035;
      const edgeZ = w / 2 - 0.035;
      for (const sy of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(t, t, w - 0.12), etch);
        e.position.set(x + face, y + sy * edgeY, z);
        this.scene.add(e);
      }
      for (const sz of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(t, h - 0.12, t), etch);
        e.position.set(x + face, y, z + sz * edgeZ);
        this.scene.add(e);
      }
    }

    addLacquerDoorPortal(x, H, doorHalf, lacquer, lacquerDeep) {
      const thick = 0.18;
      // 门楣
      this.box(thick + 0.06, 0.16, doorHalf * 2 + 0.35, lacquer, x, 2.55, 0, false);
      this.box(thick, 0.1, doorHalf * 2 + 0.2, lacquerDeep, x, 2.42, 0, false);
      // 上门上的小凹格（与窗上横板呼应）
      for (let i = 0; i < 3; i++) {
        const pz = -0.55 + i * 0.55;
        this.box(thick * 0.5, 0.28, 0.42, lacquer, x, 2.85, pz, false);
        this.box(thick * 0.25, 0.2, 0.32, lacquerDeep, x + (x > 0 ? -0.02 : 0.02), 2.85, pz, false);
      }
      // 门洞两侧圆柱
      for (const z of [-doorHalf, doorHalf]) {
        const col = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.12, 2.5, 16),
          lacquer
        );
        col.position.set(x, 1.25, z);
        this.scene.add(col);
      }
      // 门槛
      this.box(thick + 0.04, 0.06, doorHalf * 2 + 0.1, lacquer, x, 0.03, 0, false);
    }

    woodMat(map, repeatX = 2.5, repeatY = 2.5) {
      let tex = map || null;
      if (tex) {
        tex = tex.clone();
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX, repeatY);
        tex.needsUpdate = true;
      }
      return this.mat(0xe7d8bf, tex, { roughness: 0.92 });
    }

    makeConcreteFloorMat() {
      // 程序生成浅灰水泥噪点 + 低粗糙度，偏光滑自流平水泥
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#8e9499";
      ctx.fillRect(0, 0, size, size);
      const img = ctx.getImageData(0, 0, size, size);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 18;
        const v = 142 + n;
        d[i] = v;
        d[i + 1] = v + 2;
        d[i + 2] = v + 4;
        d[i + 3] = 255;
      }
      // 几道淡色浇筑接缝
      ctx.putImageData(img, 0, 0);
      ctx.strokeStyle = "rgba(120,126,132,0.35)";
      ctx.lineWidth = 2;
      for (let i = 1; i < 4; i++) {
        const p = (size / 4) * i;
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, p);
        ctx.lineTo(size, p);
        ctx.stroke();
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(8, 5);
      tex.anisotropy = 4;
      return new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: tex,
        roughness: 0.28,
        metalness: 0.04,
      });
    }

    buildYinRoom(tex) {
      const cx = -11.2;
      const cz = 6.15;
      const rw = 6.4;
      const rd = 4.9;
      const wallH = 2.7;
      const t = 0.14;
      // 外表面保持原浅木色；内饰另做铺装
      const woodWall = this.woodMat(tex.woodLight, 2.2, 1.4);

      // 外结构壳（外观不动）
      this.box(rw, wallH, t, woodWall, cx, wallH / 2, cz + rd / 2); // 北
      this.box(t, wallH, rd, woodWall, cx - rw / 2, wallH / 2, cz); // 西
      this.box(t, wallH, rd, woodWall, cx + rw / 2, wallH / 2, cz); // 东
      const doorW = 1.55;
      const southZ = cz - rd / 2;
      const side = (rw - doorW) / 2;
      this.box(side, wallH, t, woodWall, cx - (doorW + side) / 2, wallH / 2, southZ);
      this.box(side, wallH, t, woodWall, cx + (doorW + side) / 2, wallH / 2, southZ);
      this.box(doorW + 0.1, 0.14, t + 0.04, this.mat(0xc2ad8a), cx, wallH - 0.1, southZ, false);
      // 外顶仍用浅木（从室外偶见）
      this.box(rw, 0.08, rd, woodWall, cx, wallH + 0.02, cz, false);

      // —— 内饰：浅灰细木条地板 + 稻草色散拼方板（凸边框）——
      this.buildYinBoardwalkFloor(cx, cz, rw - 0.08, rd - 0.08);
      this.buildYinStrawInterior(cx, cz, rw, rd, wallH, doorW, southZ);

      // 暖光灯泡感
      const lamp = new THREE.PointLight(0xffd7a8, 0.85, 9, 2);
      lamp.position.set(cx, 2.35, cz);
      this.scene.add(lamp);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffe4b5 })
      );
      bulb.position.set(cx, 2.48, cz);
      this.scene.add(bulb);
      const lamp2 = new THREE.PointLight(0xe8c89a, 0.35, 7, 2);
      lamp2.position.set(cx - 1.5, 2.1, cz + 1.2);
      this.scene.add(lamp2);

      // 挂在门外上方，远处就能看见
      this.label("荫房", cx, 2.85, southZ - 0.55);
      this.buildDryingRack(cx - 1.55, cz + 0.15, tex);
      this.buildDryingRack(cx + 1.55, cz + 0.15, tex);
    }

    buildYinBoardwalkFloor(cx, cz, w, d) {
      // 林间栈道感：浅灰细长木条 + 缝隙
      const plank = this.mat(0xb7b3a8, null, { roughness: 0.88 });
      const plankAlt = this.mat(0xaaa69c, null, { roughness: 0.9 });
      const gapMat = this.mat(0x8a8680, null, { roughness: 0.95 });
      // 底衬
      this.box(w, 0.04, d, gapMat, cx, 0.02, cz, false);
      const plankW = 0.11;
      const gap = 0.018;
      const pitch = plankW + gap;
      const count = Math.floor(d / pitch);
      const used = count * pitch - gap;
      const z0 = cz - used / 2 + plankW / 2;
      for (let i = 0; i < count; i++) {
        const z = z0 + i * pitch;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w - 0.04, 0.035, plankW),
          i % 3 === 0 ? plankAlt : plank
        );
        mesh.position.set(cx, 0.045, z);
        this.scene.add(mesh);
      }
    }

    makeStrawPanelMat() {
      // 少量纤维噪点的稻草色
      const size = 128;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#d2bf8a";
      ctx.fillRect(0, 0, size, size);
      const img = ctx.getImageData(0, 0, size, size);
      const data = img.data;
      for (let i = 0; i < data.length; i += 4) {
        const n = (Math.random() - 0.5) * 22;
        data[i] = 210 + n;
        data[i + 1] = 191 + n * 0.85;
        data[i + 2] = 138 + n * 0.5;
      }
      ctx.putImageData(img, 0, 0);
      // 短纤维笔触
      ctx.strokeStyle = "rgba(160,140,90,0.25)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 80; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 6);
        ctx.stroke();
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1, 1);
      return new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: tex,
        roughness: 0.92,
        metalness: 0.02,
      });
    }

    buildYinStrawInterior(cx, cz, rw, rd, wallH, doorW, southZ) {
      const straw = this.makeStrawPanelMat();
      const frame = this.mat(0xe5d6b0, null, { roughness: 0.75 });
      const frameHi = this.mat(0xf0e4c4, null, { roughness: 0.65 });
      const inset = 0.08; // 贴在外壳内侧
      const panel = 0.58;
      const fW = 0.07; // 凸边框宽度
      const fD = 0.05; // 凸出厚度
      const pT = 0.025; // 面板厚度

      // 天花（向下）
      this.tileStrawSurface({
        axis: "y",
        cx,
        cy: wallH - 0.06,
        cz,
        w: rw - inset * 2,
        h: rd - inset * 2,
        panel,
        fW,
        fD,
        pT,
        straw,
        frame,
        frameHi,
        normal: -1,
      });

      // 北墙内侧（朝 -Z）
      this.tileStrawSurface({
        axis: "z",
        cx,
        cy: wallH / 2,
        cz: cz + rd / 2 - inset,
        w: rw - inset * 2,
        h: wallH - 0.1,
        panel,
        fW,
        fD,
        pT,
        straw,
        frame,
        frameHi,
        normal: -1,
      });
      // 西墙（朝 +X）
      this.tileStrawSurface({
        axis: "x",
        cx: cx - rw / 2 + inset,
        cy: wallH / 2,
        cz,
        w: rd - inset * 2,
        h: wallH - 0.1,
        panel,
        fW,
        fD,
        pT,
        straw,
        frame,
        frameHi,
        normal: 1,
      });
      // 东墙（朝 -X）
      this.tileStrawSurface({
        axis: "x",
        cx: cx + rw / 2 - inset,
        cy: wallH / 2,
        cz,
        w: rd - inset * 2,
        h: wallH - 0.1,
        panel,
        fW,
        fD,
        pT,
        straw,
        frame,
        frameHi,
        normal: -1,
      });

      // 南墙门洞两侧
      const side = (rw - doorW) / 2;
      const southCxL = cx - (doorW + side) / 2;
      const southCxR = cx + (doorW + side) / 2;
      this.tileStrawSurface({
        axis: "z",
        cx: southCxL,
        cy: wallH / 2,
        cz: southZ + inset,
        w: side - 0.05,
        h: wallH - 0.1,
        panel,
        fW,
        fD,
        pT,
        straw,
        frame,
        frameHi,
        normal: 1,
      });
      this.tileStrawSurface({
        axis: "z",
        cx: southCxR,
        cy: wallH / 2,
        cz: southZ + inset,
        w: side - 0.05,
        h: wallH - 0.1,
        panel,
        fW,
        fD,
        pT,
        straw,
        frame,
        frameHi,
        normal: 1,
      });
    }

    tileStrawSurface({
      axis,
      cx,
      cy,
      cz,
      w,
      h,
      panel,
      fW,
      fD,
      pT,
      straw,
      frame,
      frameHi,
      normal,
    }) {
      // axis: 面法线所在轴；w/h 为面上宽高；normal ±1 决定凸出方向
      const cols = Math.max(1, Math.round(w / (panel + fW)));
      const rows = Math.max(1, Math.round(h / (panel + fW)));
      const cell = Math.min(w / cols, h / rows);
      const panelSize = cell - fW;
      const usedW = cols * cell;
      const usedH = rows * cell;
      const x0 = -usedW / 2 + cell / 2;
      const y0 = -usedH / 2 + cell / 2;

      // 底衬
      const back =
        axis === "y"
          ? new THREE.BoxGeometry(usedW, pT * 0.5, usedH)
          : axis === "z"
            ? new THREE.BoxGeometry(usedW, usedH, pT * 0.5)
            : new THREE.BoxGeometry(pT * 0.5, usedH, usedW);
      const backMesh = new THREE.Mesh(back, frame);
      backMesh.position.set(cx, cy, cz);
      this.scene.add(backMesh);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const u = x0 + c * cell;
          const v = y0 + r * cell;
          let px = cx;
          let py = cy;
          let pz = cz;
          let gw;
          let gh;
          let gd;
          if (axis === "y") {
            px = cx + u;
            pz = cz + v;
            gw = panelSize;
            gh = pT;
            gd = panelSize;
          } else if (axis === "z") {
            px = cx + u;
            py = cy + v;
            pz = cz + normal * (pT * 0.5);
            gw = panelSize;
            gh = panelSize;
            gd = pT;
          } else {
            px = cx + normal * (pT * 0.5);
            py = cy + v;
            pz = cz + u;
            gw = pT;
            gh = panelSize;
            gd = panelSize;
          }
          const panelMesh = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, gd), straw);
          panelMesh.position.set(px, py, pz);
          this.scene.add(panelMesh);
        }
      }

      // 凸出边框：竖线 + 横线
      for (let c = 0; c <= cols; c++) {
        const u = -usedW / 2 + c * cell;
        let bar;
        if (axis === "y") {
          bar = new THREE.Mesh(new THREE.BoxGeometry(fW, fD, usedH + fW), frameHi);
          bar.position.set(cx + u, cy + normal * (fD * 0.35), cz);
        } else if (axis === "z") {
          bar = new THREE.Mesh(new THREE.BoxGeometry(fW, usedH + fW, fD), frameHi);
          bar.position.set(cx + u, cy, cz + normal * (fD * 0.55));
        } else {
          bar = new THREE.Mesh(new THREE.BoxGeometry(fD, usedH + fW, fW), frameHi);
          bar.position.set(cx + normal * (fD * 0.55), cy, cz + u);
        }
        this.scene.add(bar);
      }
      for (let r = 0; r <= rows; r++) {
        const v = -usedH / 2 + r * cell;
        let bar;
        if (axis === "y") {
          bar = new THREE.Mesh(new THREE.BoxGeometry(usedW + fW, fD, fW), frameHi);
          bar.position.set(cx, cy + normal * (fD * 0.35), cz + v);
        } else if (axis === "z") {
          bar = new THREE.Mesh(new THREE.BoxGeometry(usedW + fW, fW, fD), frameHi);
          bar.position.set(cx, cy + v, cz + normal * (fD * 0.55));
        } else {
          bar = new THREE.Mesh(new THREE.BoxGeometry(fD, fW, usedW + fW), frameHi);
          bar.position.set(cx + normal * (fD * 0.55), cy + v, cz);
        }
        this.scene.add(bar);
      }
    }

    buildDryingRack(x, z, tex) {
      const pale = this.woodMat(tex.woodLight, 1.2, 1.2);
      const black = this.mat(0x121212, null, { roughness: 0.96 });
      const cloth = this.mat(0xf5f1ea, null, { roughness: 0.98 });
      const W = 2.35;
      const D = 0.9;
      const postH = 2.2;
      const posts = [
        [-W / 2, -D / 2],
        [W / 2, -D / 2],
        [-W / 2, D / 2],
        [W / 2, D / 2],
      ];
      for (const [px, pz] of posts) {
        this.box(0.08, postH, 0.08, pale, x + px, postH / 2, z + pz, false);
      }
      // 横撑
      this.box(W, 0.06, 0.06, pale, x, 0.2, z - D / 2, false);
      this.box(W, 0.06, 0.06, pale, x, 0.2, z + D / 2, false);

      const levels = 5;
      for (let lv = 0; lv < levels; lv++) {
        const y = 0.32 + lv * 0.4;
        this.box(W + 0.04, 0.05, D + 0.04, pale, x, y, z, false);
        // 每层一排：白布 + 黑板上叠
        for (let i = 0; i < 5; i++) {
          const ox = -0.9 + i * 0.45;
          this.box(0.38, 0.012, 0.58, cloth, x + ox, y + 0.035, z, false);
          this.box(0.34, 0.028, 0.5, black, x + ox, y + 0.055, z, false);
          this.box(0.38, 0.012, 0.58, cloth, x + ox, y + 0.085, z, false);
          this.box(0.34, 0.028, 0.5, black, x + ox, y + 0.105, z, false);
        }
      }
    }

    addCorridorEndPlant(H) {
      const plant = this.makeBlueWhiteVasePlant(H * 0.66);
      plant.position.set(0.15, 0, -7.85);
      this.scene.add(plant);
      this.colliders.push({
        minX: -0.35,
        maxX: 0.65,
        minZ: -8.25,
        maxZ: -7.45,
      });
    }

    makeBlueWhitePorcelainMat() {
      const size = 256;
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#f4f6f8";
      ctx.fillRect(0, 0, size, size);
      // 青花条带与卷草
      ctx.strokeStyle = "#1e4a8c";
      ctx.fillStyle = "#2a5f9e";
      ctx.lineWidth = 3;
      for (let y = 20; y < size; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= size; x += 8) {
          ctx.lineTo(x, y + Math.sin(x * 0.08) * 6);
        }
        ctx.stroke();
        ctx.beginPath();
        for (let x = 16; x < size; x += 40) {
          ctx.ellipse(x, y + 18, 10, 14, 0, 0, Math.PI * 2);
        }
        ctx.stroke();
      }
      // 缠枝点缀
      ctx.fillStyle = "#163a72";
      for (let i = 0; i < 24; i++) {
        const x = (i * 47) % size;
        const y = (i * 73) % size;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      const map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(2, 2);
      return new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map,
        roughness: 0.28,
        metalness: 0.08,
      });
    }

    makeBlueWhiteVasePlant(targetH) {
      // 青花瓷瓶 + 直立绿植，少旁逸
      const g = new THREE.Group();
      const porcelain = this.makeBlueWhitePorcelainMat();
      const glazeRim = this.mat(0xe8eef5, null, { roughness: 0.25, metalness: 0.1 });
      const soil = this.mat(0x3a2a1c, null, { roughness: 0.95 });
      const stemMat = this.mat(0x3d5c2e, null, { roughness: 0.8 });
      const leafMat = this.mat(0x4a7a38, null, { roughness: 0.75 });
      const leafDark = this.mat(0x355c2a, null, { roughness: 0.78 });

      const vaseH = 0.52;
      // 瓶身：底窄 → 腹鼓 → 收颈
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.06, 20), porcelain);
      foot.position.y = 0.03;
      g.add(foot);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), porcelain);
      body.scale.set(1, 1.15, 1);
      body.position.y = 0.26;
      g.add(body);
      const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 0.12, 18), porcelain);
      shoulder.position.y = 0.42;
      g.add(shoulder);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.1, 16), porcelain);
      neck.position.y = 0.52;
      g.add(neck);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 8, 20), glazeRim);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.57;
      g.add(rim);
      const dirt = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.03, 14), soil);
      dirt.position.y = 0.55;
      g.add(dirt);

      // 主茎直立
      const plantTop = targetH;
      const stemH = plantTop - vaseH + 0.05;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, stemH, 10), stemMat);
      stem.position.y = vaseH + stemH / 2;
      g.add(stem);

      // 叶片沿主茎螺旋上排，略收紧半径
      const leafCount = 18;
      for (let i = 0; i < leafCount; i++) {
        const t = i / (leafCount - 1);
        const y = vaseH + 0.15 + t * (stemH - 0.2);
        const ang = t * Math.PI * 4.2;
        const len = 0.28 + (1 - t) * 0.12;
        const leaf = new THREE.Mesh(
          new THREE.SphereGeometry(0.09, 8, 6),
          i % 2 ? leafMat : leafDark
        );
        leaf.scale.set(0.35, len / 0.18, 0.12);
        // 叶片上扬、贴近主干
        const r = 0.06 + (1 - t) * 0.05;
        leaf.position.set(Math.cos(ang) * r, y, Math.sin(ang) * r);
        leaf.rotation.z = Math.cos(ang) * 0.35;
        leaf.rotation.x = Math.sin(ang) * 0.35;
        leaf.rotation.y = ang;
        g.add(leaf);
      }
      // 顶心新叶簇（收束）
      for (let i = 0; i < 5; i++) {
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), leafMat);
        tip.scale.set(0.3, 1.6, 0.15);
        const a = (i / 5) * Math.PI * 2;
        tip.position.set(Math.cos(a) * 0.03, plantTop - 0.08, Math.sin(a) * 0.03);
        tip.rotation.z = Math.cos(a) * 0.2;
        tip.rotation.x = Math.sin(a) * 0.2;
        g.add(tip);
      }

      return g;
    }

    addPolishMaterialDemoTable(tex) {
      // 走廊里、左车间门外右手侧（靠大漆玻璃墙）
      const table = this.makePolishMaterialDemoTable(tex);
      table.position.set(-2.7, 0, 3.55);
      this.scene.add(table);
      this.colliders.push({
        minX: -3.4,
        maxX: -1.95,
        minZ: 1.7,
        maxZ: 5.4,
      });
    }

    makePolishMaterialDemoTable(tex) {
      const g = new THREE.Group();
      const topMat = this.mat(0xc8ccd0, null, { roughness: 0.55, metalness: 0.08 });
      const legMat = this.mat(0x9aa0a6, null, { roughness: 0.5, metalness: 0.12 });
      const celadon = this.mat(0xb7c9b0, null, { roughness: 0.35, metalness: 0.05 });
      const water = this.mat(0xa8c8d4, null, {
        roughness: 0.12,
        metalness: 0.05,
        transparent: true,
        opacity: 0.45,
      });
      const oil = this.mat(0xd8b84a, null, {
        roughness: 0.2,
        metalness: 0.05,
        transparent: true,
        opacity: 0.55,
      });
      const brickDust = this.mat(0xc8c6c0, null, { roughness: 0.95 });
      const talc = this.mat(0xf4f4f2, null, { roughness: 0.92 });
      const hair = this.mat(0x1a1410, null, { roughness: 0.9 });
      const paper = this.mat(0x6b4a2a, null, { roughness: 0.85 });

      // 浅灰长桌加宽，碗与画前后分开
      const L = 3.4;
      const W = 1.2;
      const topY = 0.82;
      const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, L), topMat);
      top.position.set(0, topY, 0);
      g.add(top);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.02, L + 0.02), legMat);
      rim.position.set(0, topY - 0.035, 0);
      g.add(rim);
      for (const [lx, lz] of [
        [-0.48, -1.45],
        [0.48, -1.45],
        [-0.48, 1.45],
        [0.48, 1.45],
      ]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, topY - 0.03, 0.06), legMat);
        leg.position.set(lx, (topY - 0.03) / 2, lz);
        g.add(leg);
      }

      const names = ["砂纸 2000目", "头发丝", "豆油", "细砖灰", "滑石粉"];
      const kinds = ["sandpaper", "hair", "oil", "brick", "talc"];
      const spacing = 0.58;
      const z0 = -((names.length - 1) * spacing) / 2;
      const bowlX = 0.22; // 靠走廊侧
      const plateX = 0.42;

      for (let i = 0; i < names.length; i++) {
        const z = z0 + i * spacing;
        g.add(this.makeMaterialNameplate(names[i], plateX, topY + 0.02, z));
        const bowl = this.makeCeladonBowl(celadon);
        bowl.position.set(bowlX, topY + 0.03, z);
        g.add(bowl);
        g.add(this.makeBowlContent(kinds[i], bowlX, topY + 0.055, z, {
          water,
          oil,
          brickDust,
          talc,
          hair,
          paper,
        }));
      }

      // 里侧方画，与碗拉开间距
      const arts = [
        this.makeDemoArtPanel("blackFloral"),
        this.makeDemoArtPanel("yellowPolish"),
        this.makeDemoArtPanel("yellowFloral"),
      ];
      const artZ = [-0.95, 0.05, 1.05];
      const artThick = 0.038;
      const artX = -0.38;
      arts.forEach((art, i) => {
        art.position.set(artX, topY + 0.03 + artThick / 2, artZ[i]);
        art.rotation.set(0, 0, 0);
        g.add(art);
      });

      return g;
    }

    makeCeladonBowl(mat) {
      const g = new THREE.Group();
      // 八角浅碗（方口切角）
      const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.11, 0.055, 8), mat);
      g.add(outer);
      const inner = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.1, 0.04, 8),
        this.mat(0xc5d4be, null, { roughness: 0.4 })
      );
      inner.position.y = 0.012;
      g.add(inner);
      // 碗沿
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.008, 6, 8), mat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.028;
      g.add(rim);
      return g;
    }

    makeBowlContent(kind, x, y, z, mats) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      if (kind === "sandpaper") {
        const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.018, 16), mats.water);
        liquid.position.y = 0.005;
        g.add(liquid);
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.07, 10), mats.paper);
        roll.rotation.z = Math.PI / 2;
        roll.position.set(-0.02, 0.02, 0);
        g.add(roll);
      } else if (kind === "hair") {
        const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.018, 16), mats.water);
        liquid.position.y = 0.005;
        g.add(liquid);
        for (let i = 0; i < 5; i++) {
          const clump = new THREE.Mesh(new THREE.SphereGeometry(0.025 + (i % 3) * 0.008, 8, 6), mats.hair);
          clump.scale.set(1.4, 0.55, 1.1);
          clump.position.set((i - 2) * 0.02, 0.018, ((i % 2) - 0.5) * 0.03);
          g.add(clump);
        }
      } else if (kind === "oil") {
        const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.022, 16), mats.oil);
        liquid.position.y = 0.006;
        g.add(liquid);
      } else if (kind === "brick") {
        const mound = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), mats.brickDust);
        mound.scale.set(1.15, 0.55, 1.15);
        mound.position.y = 0.02;
        g.add(mound);
        const dust = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 12), mats.brickDust);
        dust.position.y = 0.004;
        g.add(dust);
      } else {
        // 滑石粉
        const mound = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8), mats.talc);
        mound.scale.set(1.2, 0.6, 1.2);
        mound.position.y = 0.022;
        g.add(mound);
        const dust = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 12), mats.talc);
        dust.position.y = 0.004;
        g.add(dust);
      }
      return g;
    }

    makeMaterialNameplate(text, x, y, z) {
      const g = new THREE.Group();
      // 透明支架
      const stand = new THREE.Mesh(
        new THREE.BoxGeometry(0.01, 0.08, 0.04),
        this.mat(0xdde8ef, null, { roughness: 0.2, transparent: true, opacity: 0.35 })
      );
      stand.position.set(0, 0.04, 0);
      g.add(stand);
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.01, 0.08),
        this.mat(0xe8eef2, null, { roughness: 0.3, transparent: true, opacity: 0.5 })
      );
      base.position.set(0, 0.005, 0);
      g.add(base);

      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 96;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#f7f7f5";
      ctx.fillRect(0, 0, 256, 96);
      // 左侧锯齿金棕边
      ctx.fillStyle = "#b8924a";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(28, 0);
      for (let i = 0; i < 8; i++) {
        const y0 = (i / 8) * 96;
        const y1 = ((i + 0.5) / 8) * 96;
        const y2 = ((i + 1) / 8) * 96;
        ctx.lineTo(18, y1);
        ctx.lineTo(28, y2);
      }
      ctx.lineTo(0, 96);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      ctx.font = "bold 40px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 148, 50);
      const map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(0.26, 0.1),
        new THREE.MeshBasicMaterial({ map, transparent: true })
      );
      card.position.set(0.02, 0.08, 0);
      card.rotation.y = Math.PI / 2; // 面向走廊
      g.add(card);
      g.position.set(x, y, z);
      return g;
    }

    makeDemoArtPanel(kind) {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext("2d");
      if (kind === "blackFloral") {
        ctx.fillStyle = "#0a0a0c";
        ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = "#e8d5a3";
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          ctx.ellipse(80 + i * 18, 140 - i * 12, 30, 12, -0.6, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = "#f2f0ea";
        ctx.beginPath();
        ctx.arc(160, 90, 8, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === "yellowPolish") {
        ctx.fillStyle = "#e8c84a";
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = "#f5e6b8";
        ctx.beginPath();
        ctx.ellipse(90, 120, 40, 55, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(140, 100, 35, 50, -0.1, 0, Math.PI * 2);
        ctx.fill();
        // 推光灰白糊
        ctx.fillStyle = "rgba(245,245,240,0.85)";
        ctx.beginPath();
        ctx.moveTo(130, 40);
        ctx.quadraticCurveTo(220, 80, 240, 200);
        ctx.lineTo(256, 256);
        ctx.lineTo(150, 256);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = "#e0b83c";
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = "#c43a3a";
        ctx.beginPath();
        ctx.ellipse(100, 130, 28, 40, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f0dca0";
        ctx.beginPath();
        ctx.ellipse(160, 100, 35, 48, -0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      const map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
      // 有厚度的漆板，平放时 Y 为厚度方向
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.038, 0.42),
        this.mat(0xffffff, map, { roughness: 0.35 })
      );
      // 侧边略深，厚度更明显
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.425, 0.034, 0.425),
        this.mat(0x2a2218, null, { roughness: 0.7 })
      );
      edge.position.y = -0.002;
      const group = new THREE.Group();
      group.add(edge);
      group.add(panel);
      return group;
    }

    addDuobaogeShelf(tex) {
      // 荫房东侧空位：多宝阁（月洞门 + 不对称格架）+ 漆器
      const shelf = this.makeDuobaoge(tex);
      // 贴北侧青蓝墙，背后少留空
      shelf.position.set(-5.85, 0, 8.55);
      shelf.rotation.y = Math.PI; // 面向室内（南）
      shelf.scale.setScalar(1.05);
      this.scene.add(shelf);
      this.colliders.push({
        minX: -7.15,
        maxX: -4.55,
        minZ: 8.15,
        maxZ: 8.85,
      });
    }

    makeDuobaoge(tex) {
      const g = new THREE.Group();
      const wood = this.mat(0x5a2e22, null, { roughness: 0.62, metalness: 0.08 });
      const woodDeep = this.mat(0x3e1c14, null, { roughness: 0.7, metalness: 0.06 });
      const woodHi = this.mat(0x7a4030, null, { roughness: 0.55, metalness: 0.1 });
      const blind = this.mat(0xc4b49a, null, { roughness: 0.9 });
      const lacBlack = new THREE.MeshStandardMaterial({
        color: 0x0c0c0e,
        roughness: 0.22,
        metalness: 0.15,
      });
      const lacRed = new THREE.MeshStandardMaterial({
        color: 0x8b1520,
        roughness: 0.25,
        metalness: 0.12,
      });
      const lacGold = new THREE.MeshStandardMaterial({
        color: 0xc9a84c,
        roughness: 0.3,
        metalness: 0.35,
      });

      const W = 2.55;
      const H = 2.35;
      const D = 0.32;
      const t = 0.045;

      // 背板（竹帘感横条）
      for (let i = 0; i < 28; i++) {
        const slat = new THREE.Mesh(
          new THREE.BoxGeometry(W - 0.08, 0.055, 0.02),
          i % 3 === 0 ? this.mat(0xb8a888, null, { roughness: 0.92 }) : blind
        );
        slat.position.set(0, 0.15 + i * 0.075, -D / 2 + 0.02);
        g.add(slat);
      }

      // 外框
      const posts = [
        [-W / 2, 0],
        [W / 2, 0],
      ];
      for (const [px] of posts) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(t * 1.3, H, D), wood);
        post.position.set(px, H / 2, 0);
        g.add(post);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(W, t * 1.4, D + 0.02), woodHi);
      top.position.set(0, H - t * 0.5, 0);
      g.add(top);
      const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, 0.12, D + 0.06), woodDeep);
      base.position.set(0, 0.06, 0);
      g.add(base);
      const apron = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.18, t), wood);
      apron.position.set(0, 0.22, D / 2 - t / 2);
      g.add(apron);

      // 中央月洞门
      const moonR = 0.52;
      const moonY = 1.25;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(moonR, 0.04, 10, 40),
        woodHi
      );
      ring.position.set(0, moonY, D / 2 - 0.02);
      g.add(ring);
      // 月洞内缘加深
      const ringIn = new THREE.Mesh(
        new THREE.TorusGeometry(moonR - 0.05, 0.018, 8, 36),
        woodDeep
      );
      ringIn.position.set(0, moonY, D / 2 - 0.01);
      g.add(ringIn);

      // 月洞上下横带
      const bandTop = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.08, D - 0.04), wood);
      bandTop.position.set(0, moonY + moonR + 0.08, 0);
      g.add(bandTop);
      const bandBot = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.08, D - 0.04), wood);
      bandBot.position.set(0, moonY - moonR - 0.08, 0);
      g.add(bandBot);

      // 左右不对称多宝格
      const addBay = (x0, y0, w, h) => {
        // 层板
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, D - 0.06), wood);
        shelf.position.set(x0, y0, 0.01);
        g.add(shelf);
        // 竖隔
        const div = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, D - 0.06), woodDeep);
        div.position.set(x0 - w / 2, y0 + h / 2, 0.01);
        g.add(div);
        const div2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, D - 0.06), woodDeep);
        div2.position.set(x0 + w / 2, y0 + h / 2, 0.01);
        g.add(div2);
        // 顶板
        const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, 0.03, D - 0.06), wood);
        cap.position.set(x0, y0 + h, 0.01);
        g.add(cap);
      };

      // 左侧格
      addBay(-0.85, 0.35, 0.55, 0.38);
      addBay(-0.85, 0.78, 0.55, 0.32);
      addBay(-0.95, 1.2, 0.38, 0.45);
      addBay(-0.7, 1.75, 0.5, 0.35);
      // 右侧格（错落）
      addBay(0.85, 0.35, 0.55, 0.42);
      addBay(0.9, 0.85, 0.48, 0.36);
      addBay(0.75, 1.3, 0.55, 0.4);
      addBay(0.95, 1.8, 0.42, 0.32);

      // 局部冰裂纹格心（示意）
      const addLattice = (x, y, w, h) => {
        for (let i = 0; i < 3; i++) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, 0.02), woodHi);
          bar.position.set(x, y + 0.05 + i * 0.08, D / 2 - 0.04);
          g.add(bar);
        }
        for (let i = 0; i < 3; i++) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.012, h * 0.7, 0.02), woodHi);
          bar.position.set(x - w / 2 + 0.08 + i * 0.12, y + h * 0.35, D / 2 - 0.04);
          g.add(bar);
        }
      };
      addLattice(-0.85, 0.38, 0.45, 0.3);
      addLattice(0.85, 0.38, 0.45, 0.3);

      // —— 漆器摆件 ——
      const placeVase = (x, y, kind) => {
        const piece = this.makeLacquerVessel(kind, lacBlack, lacRed, lacGold);
        piece.position.set(x, y, 0.02);
        g.add(piece);
      };
      placeVase(-0.85, 0.4, "blackJar");
      placeVase(-0.85, 0.82, "goldTall");
      placeVase(-0.95, 1.24, "redSlim");
      placeVase(-0.7, 1.8, "blackJar");
      placeVase(0.85, 0.4, "goldTall");
      placeVase(0.9, 0.9, "blackJar");
      placeVase(0.75, 1.35, "redSlim");
      placeVase(0.95, 1.85, "goldBulb");
      // 月洞两侧地台上各一件
      placeVase(-0.35, 0.4, "goldBulb");
      placeVase(0.35, 0.4, "blackJar");

      return g;
    }

    makeLacquerVessel(kind, lacBlack, lacRed, lacGold) {
      const g = new THREE.Group();
      if (kind === "blackJar") {
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 12), lacBlack);
        body.scale.set(1, 1.15, 1);
        body.position.y = 0.1;
        g.add(body);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.06, 12), lacBlack);
        neck.position.y = 0.2;
        g.add(neck);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.02, 12), lacBlack);
        rim.position.y = 0.24;
        g.add(rim);
      } else if (kind === "redSlim") {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.22, 12), lacRed);
        body.position.y = 0.14;
        g.add(body);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.12, 10), lacRed);
        neck.position.y = 0.3;
        g.add(neck);
        const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.022, 0.03, 10), lacRed);
        mouth.position.y = 0.38;
        g.add(mouth);
      } else if (kind === "goldTall") {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.28, 12), lacGold);
        body.position.y = 0.16;
        g.add(body);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.04, 0.14, 10), lacGold);
        neck.position.y = 0.36;
        g.add(neck);
        const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.022, 0.04, 10), lacGold);
        flare.position.y = 0.44;
        g.add(flare);
      } else {
        // goldBulb
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 12), lacGold);
        body.scale.set(1.05, 1.0, 1.05);
        body.position.y = 0.09;
        g.add(body);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.08, 10), lacGold);
        neck.position.y = 0.18;
        g.add(neck);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.028, 0.025, 10), lacGold);
        rim.position.y = 0.23;
        g.add(rim);
      }
      return g;
    }

    buildScrapeArea(tex, wood) {
      // 棕色长桌
      this.box(3.2, 0.78, 1.15, this.mat(wood, tex.scrape), -9.2, 0.39, -1.35);
      // 桌面贴图薄层
      if (tex.tableTop) {
        const top = new THREE.Mesh(
          new THREE.BoxGeometry(3.15, 0.03, 1.12),
          this.mat(0xffffff, tex.tableTop, { roughness: 0.9 })
        );
        top.position.set(-9.2, 0.8, -1.35);
        this.scene.add(top);
      }
      this.addLongTableProps(-9.2, 0.82, -1.35);

      // 长桌旁四腿小凳
      this.addStool(-7.35, -1.15, 0x4a3228);

      // 三张小型方工作台 + 单侧垂落白布 + 灰浆铲
      const clothMat = this.mat(0xf4f0e8, tex.clothRough, {
        roughness: 0.98,
        side: THREE.DoubleSide,
      });
      const benchMat = this.mat(0x5a4030, null, { roughness: 0.88 });
      const positions = [
        [-10.6, 0.9],
        [-9.2, 1.05],
        [-7.8, 0.9],
      ];
      positions.forEach(([bx, bz], idx) => {
        this.box(1.05, 0.1, 1.05, benchMat, bx, 0.78, bz, false);
        const leg = 0.08;
        const h = 0.73;
        for (const [lx, lz] of [
          [-0.4, -0.4],
          [0.4, -0.4],
          [-0.4, 0.4],
          [0.4, 0.4],
        ]) {
          this.box(leg, h, leg, benchMat, bx + lx, h / 2, bz + lz, false);
        }

        // 台面白布（略偏一侧，方便单边垂落）
        const cloth = new THREE.Mesh(
          new THREE.BoxGeometry(1.08, 0.022, 1.0),
          clothMat
        );
        cloth.position.set(bx + 0.05, 0.845, bz);
        this.scene.add(cloth);

        // 单侧垂落（朝 +X，自然下挂）
        const drape = new THREE.Mesh(
          new THREE.PlaneGeometry(1.0, 0.32),
          clothMat
        );
        drape.position.set(bx + 0.58, 0.7, bz);
        drape.rotation.y = -Math.PI / 2;
        drape.rotation.x = 0.08;
        this.scene.add(drape);
        // 折边
        const lip = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.018, 1.0),
          clothMat
        );
        lip.position.set(bx + 0.545, 0.835, bz);
        this.scene.add(lip);

        // 白布上少许浅色灰浆
        this.addAshSmear(bx, 0.862, bz, idx);

        // 灰浆抹刀（短柄扁铲）
        this.addAshSpatula(bx + 0.12, 0.875, bz - 0.05, 0.55 + idx * 0.25);
      });
    }

    addLongTableProps(cx, y, cz) {
      const steel = this.mat(0xc5ccd2, null, { metalness: 0.72, roughness: 0.28 });
      const steelDark = this.mat(0x8e959c, null, { metalness: 0.55, roughness: 0.4 });
      const glass = this.mat(0xd8eef5, null, {
        metalness: 0.05,
        roughness: 0.12,
        transparent: true,
        opacity: 0.35,
      });
      const ceramic = this.mat(0xd8b56a, null, { roughness: 0.55 });
      const woodLite = this.mat(0xe6d3b0, null, { roughness: 0.85 });
      const blackPlastic = this.mat(0x1a1a1a, null, { roughness: 0.7 });
      const redCloth = this.mat(0xa02828, null, { roughness: 0.95 });

      // 红布团（左侧）
      const rag = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), redCloth);
      rag.scale.set(1.4, 0.45, 1.1);
      rag.position.set(cx - 1.25, y + 0.03, cz + 0.25);
      this.scene.add(rag);

      // 不锈钢盆
      const basin = new THREE.Group();
      const outer = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.16, 0.1, 24, 1, true),
        steel
      );
      outer.position.y = 0.05;
      basin.add(outer);
      const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.008, 24), steelDark);
      bottom.position.y = 0.006;
      basin.add(bottom);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.01, 8, 28), steel);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.1;
      basin.add(rim);
      // 盆内一点水/灰浆
      const liquid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, 0.012, 20),
        this.mat(0xb8b4a8, null, { roughness: 0.3, metalness: 0.1 })
      );
      liquid.position.y = 0.03;
      basin.add(liquid);
      basin.position.set(cx - 0.85, y, cz + 0.05);
      this.scene.add(basin);

      // 玻璃水瓶
      const bottle = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.038, 0.22, 16),
        glass
      );
      body.position.y = 0.11;
      bottle.add(body);
      const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.022, 0.06, 12),
        glass
      );
      neck.position.y = 0.25;
      bottle.add(neck);
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12),
        steel
      );
      cap.position.y = 0.29;
      bottle.add(cap);
      bottle.position.set(cx - 0.55, y, cz - 0.28);
      this.scene.add(bottle);

      // 小瓷碗（浅金黄）
      const bowl = new THREE.Group();
      const bowlBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.045, 0.045, 20, 1, true),
        ceramic
      );
      bowlBody.position.y = 0.025;
      bowl.add(bowlBody);
      const bowlBot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.008, 16),
        ceramic
      );
      bowlBot.position.y = 0.005;
      bowl.add(bowlBot);
      const paste = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.012, 16),
        this.mat(0xcfc8b6, null, { roughness: 1 })
      );
      paste.position.y = 0.02;
      bowl.add(paste);
      bowl.position.set(cx - 0.35, y, cz + 0.28);
      this.scene.add(bowl);

      // 浅色木托盘
      const tray = new THREE.Group();
      const trayBase = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.015, 0.28), woodLite);
      tray.add(trayBase);
      // 四边矮沿
      for (const [w, d, px, pz] of [
        [0.42, 0.02, 0, 0.14],
        [0.42, 0.02, 0, -0.14],
        [0.02, 0.28, 0.21, 0],
        [0.02, 0.28, -0.21, 0],
      ]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), woodLite);
        rail.position.set(px, 0.02, pz);
        tray.add(rail);
      }
      // 托盘里黑手套：正向平放，五指分开
      tray.add(this.makeWorkGlove(-0.02, 0.028, 0.02, 0));
      tray.add(this.makeWorkGlove(0.12, 0.028, -0.06, Math.PI));
      tray.position.set(cx + 0.22, y + 0.01, cz + 0.06);
      tray.scale.set(1.35, 1, 1.25);
      this.scene.add(tray);

      // 剪刀（银刃 + 深色圆木柄，对照参考图）
      const scissors = this.makeScissors();
      scissors.position.set(cx + 1.05, y + 0.014, cz - 0.18);
      scissors.rotation.y = -0.55;
      scissors.scale.setScalar(1.5);
      this.scene.add(scissors);

      // 胶带卷
      const tape = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 8, 20), this.mat(0xf2f2f0, null, { roughness: 0.8 }));
      tape.rotation.x = Math.PI / 2;
      tape.position.set(cx + 1.2, y + 0.02, cz + 0.25);
      this.scene.add(tape);

      // 橙色柄小钳
      const pliers = new THREE.Group();
      const pBlade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.008, 0.02), steelDark);
      pBlade.position.set(0.04, 0.006, 0);
      pliers.add(pBlade);
      const pHandle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.014, 0.018), this.mat(0xe85a20, null, { roughness: 0.7 }));
      pHandle.position.set(-0.05, 0.008, 0.01);
      pHandle.rotation.y = 0.15;
      pliers.add(pHandle);
      const pHandle2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.014, 0.018), this.mat(0xe85a20, null, { roughness: 0.7 }));
      pHandle2.position.set(-0.05, 0.008, -0.01);
      pHandle2.rotation.y = -0.15;
      pliers.add(pHandle2);
      pliers.position.set(cx + 1.15, y + 0.01, cz - 0.35);
      pliers.rotation.y = 0.8;
      this.scene.add(pliers);
    }

    makeWorkGlove(x, y, z, rotY = 0) {
      // 正向平放：掌心朝上，五指张开朝 +X
      const g = new THREE.Group();
      const rubber = this.mat(0x1a1a1a, null, { roughness: 0.72 });
      const rubberSoft = this.mat(0x222222, null, { roughness: 0.78 });
      const cuff = this.mat(0x8b1e1e, null, { roughness: 0.7 });

      // 腕套
      const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.022, 0.07), cuff);
      wrist.position.set(-0.09, 0, 0);
      g.add(wrist);

      // 手掌
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.078), rubber);
      palm.position.set(-0.01, 0.002, 0);
      g.add(palm);
      // 掌心微鼓
      const mound = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), rubberSoft);
      mound.scale.set(1.15, 0.45, 1);
      mound.position.set(-0.01, 0.012, 0);
      g.add(mound);

      // 四指：食指/中指/无名/小指，分开可辨
      const fingerSpecs = [
        { z: -0.028, len: 0.085, w: 0.016 }, // 小指
        { z: -0.01, len: 0.1, w: 0.018 }, // 无名
        { z: 0.01, len: 0.105, w: 0.019 }, // 中指
        { z: 0.03, len: 0.095, w: 0.017 }, // 食指
      ];
      fingerSpecs.forEach((f) => {
        const base = new THREE.Mesh(new THREE.BoxGeometry(f.len * 0.55, 0.016, f.w), rubber);
        base.position.set(0.06, 0.004, f.z);
        g.add(base);
        const mid = new THREE.Mesh(new THREE.BoxGeometry(f.len * 0.28, 0.014, f.w * 0.95), rubber);
        mid.position.set(0.06 + f.len * 0.4, 0.005, f.z);
        g.add(mid);
        const tip = new THREE.Mesh(new THREE.BoxGeometry(f.len * 0.22, 0.012, f.w * 0.85), rubberSoft);
        tip.position.set(0.06 + f.len * 0.62, 0.004, f.z);
        // 指尖略圆
        const tipCap = new THREE.Mesh(new THREE.SphereGeometry(f.w * 0.45, 6, 6), rubberSoft);
        tipCap.scale.set(1.2, 0.7, 1);
        tipCap.position.set(0.06 + f.len * 0.74, 0.004, f.z);
        g.add(tip);
        g.add(tipCap);
      });

      // 拇指：斜伸一侧
      const thumbBase = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.016, 0.02), rubber);
      thumbBase.position.set(0.01, 0.005, 0.055);
      thumbBase.rotation.y = 0.85;
      g.add(thumbBase);
      const thumbTip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.014, 0.018), rubberSoft);
      thumbTip.position.set(0.04, 0.006, 0.075);
      thumbTip.rotation.y = 0.95;
      g.add(thumbTip);
      const thumbCap = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 6), rubberSoft);
      thumbCap.scale.set(1.3, 0.7, 1);
      thumbCap.position.set(0.055, 0.006, 0.088);
      g.add(thumbCap);

      g.position.set(x, y, z);
      g.rotation.y = rotY;
      g.rotation.x = 0; // 正向平贴托盘
      return g;
    }

    makeScissors() {
      // 对照清晰参考：银钢长刃 + 深色厚圆柄，合拢平放
      const g = new THREE.Group();
      const steel = this.mat(0xc5c9ce, null, { metalness: 0.85, roughness: 0.38 });
      const steelDark = this.mat(0x9aa0a6, null, { metalness: 0.7, roughness: 0.48 });
      const wood = this.mat(0x2a221c, null, { roughness: 0.88 });
      const woodHi = this.mat(0x3a3028, null, { roughness: 0.82 });

      // —— 银刃（尖朝 +X，两片合拢）——
      const bladeLen = 0.17;
      const addBlade = (yOff, zOff, open) => {
        const body = new THREE.Mesh(new THREE.BoxGeometry(bladeLen, 0.0045, 0.028), steel);
        body.position.set(bladeLen * 0.48, yOff, zOff);
        body.rotation.y = open;
        g.add(body);
        // 刃口斜面
        const bevel = new THREE.Mesh(new THREE.BoxGeometry(bladeLen * 0.92, 0.003, 0.01), steelDark);
        bevel.position.set(bladeLen * 0.48, yOff - 0.001, zOff + (open > 0 ? -0.01 : 0.01));
        bevel.rotation.y = open;
        g.add(bevel);
        // 尖端收窄
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.0035, 0.012), steel);
        tip.position.set(bladeLen * 0.95, yOff, zOff * 0.3);
        tip.rotation.y = open * 1.4;
        g.add(tip);
      };
      addBlade(0.005, 0.005, 0.04);
      addBlade(0.01, -0.005, -0.04);

      // 铆钉
      const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.015, 14), steelDark);
      pivot.position.set(0.01, 0.008, 0);
      g.add(pivot);
      const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 12), steel);
      rivet.position.set(0.01, 0.017, 0);
      g.add(rivet);

      // —— 金属柄颈（铆钉到木环）——
      const shankL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.007, 0.014), steelDark);
      shankL.position.set(-0.03, 0.006, -0.02);
      shankL.rotation.y = 0.32;
      g.add(shankL);
      const shankR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.007, 0.014), steelDark);
      shankR.position.set(-0.03, 0.01, 0.02);
      shankR.rotation.y = -0.32;
      g.add(shankR);

      // —— 深色厚圆柄（略椭圆、截面粗）——
      const addHandle = (cx, cy, cz, rx, rz) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(rx, 0.011, 12, 28), wood);
        ring.rotation.x = Math.PI / 2;
        ring.scale.z = rz / rx; // 略拉成椭圆
        ring.position.set(cx, cy, cz);
        g.add(ring);
        // 外侧高光条，模拟木纹厚度
        const rim = new THREE.Mesh(new THREE.TorusGeometry(rx * 1.02, 0.005, 8, 24), woodHi);
        rim.rotation.x = Math.PI / 2;
        rim.scale.z = rz / rx;
        rim.position.set(cx, cy + 0.002, cz);
        g.add(rim);
        // 柄根与金属衔接的一小段
        const join = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.01, 0.028, 10), wood);
        join.rotation.z = Math.PI / 2;
        join.position.set(cx + rx * 0.55, cy, cz * 0.35);
        g.add(join);
      };
      addHandle(-0.105, 0.01, -0.048, 0.048, 0.055);
      addHandle(-0.1, 0.01, 0.048, 0.045, 0.052);

      return g;
    }

    addAshSmear(x, y, z, seed = 0) {
      // 一大片浅色灰浆，约占台面一半左右，边缘略不规则
      const paste = this.mat(0xd8d4c8, null, { roughness: 0.98 });
      const paste2 = this.mat(0xcfcab8, null, { roughness: 1 });
      const ox = -0.08 + (seed % 3) * 0.03;
      const oz = -0.06 + (seed % 2) * 0.04;
      const rot = -0.18 + seed * 0.07;

      const main = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 0.005, 0.4),
        paste
      );
      main.position.set(x + ox, y, z + oz);
      main.rotation.y = rot;
      this.scene.add(main);

      // 边缘稍薄的延伸，连成一片而不是碎块
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.0035, 0.22),
        paste2
      );
      wing.position.set(x + ox + 0.12, y + 0.0005, z + oz - 0.08);
      wing.rotation.y = rot + 0.12;
      this.scene.add(wing);

      const tip = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.003, 0.16),
        paste
      );
      tip.position.set(x + ox - 0.1, y + 0.0005, z + oz + 0.1);
      tip.rotation.y = rot - 0.1;
      this.scene.add(tip);

      // 刮痕纹理（贴在大片上）
      const streak = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.0015, 0.04),
        paste2
      );
      streak.position.set(x + ox + 0.02, y + 0.003, z + oz);
      streak.rotation.y = rot - 0.05;
      this.scene.add(streak);
    }

    addAshSpatula(x, y, z, rotY = 0) {
      // 梯形铲板（柄端窄、刃口宽）+ 浅木圆柄 + 金属箍 + 刃口浅灰浆
      const g = new THREE.Group();
      const steel = this.mat(0xb8bec4, null, { metalness: 0.52, roughness: 0.45 });
      const wood = this.mat(0xd2b48c, null, { roughness: 0.7 });
      const ferruleMat = this.mat(0x9aa3ab, null, { metalness: 0.65, roughness: 0.35 });
      const paste = this.mat(0xe2ddd0, null, { roughness: 0.98 });

      // 梯形截面：X 为长度，Y 为宽度
      const shape = new THREE.Shape();
      const len = 0.12;
      const back = 0.026;
      const tip = 0.09;
      shape.moveTo(0, -back);
      shape.lineTo(len, -tip);
      shape.lineTo(len, tip);
      shape.lineTo(0, back);
      shape.closePath();
      const bladeGeom = new THREE.ExtrudeGeometry(shape, {
        depth: 0.0024,
        bevelEnabled: false,
      });
      const blade = new THREE.Mesh(bladeGeom, steel);
      // 挤出沿 Z，转到贴台面（薄方向朝上）
      blade.rotation.x = -Math.PI / 2;
      blade.position.set(-0.02, 0.008, 0);
      g.add(blade);

      // 刃口浅灰浆（贴在宽端）
      const smear = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.0035, 0.15),
        paste
      );
      smear.position.set(0.09, 0.011, 0);
      g.add(smear);
      const smear2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.028, 0.004, 0.08),
        this.mat(0xd8d2c4, null, { roughness: 1 })
      );
      smear2.position.set(0.08, 0.012, 0.02);
      smear2.rotation.y = 0.15;
      g.add(smear2);

      // 金属箍
      const ferrule = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.016, 0.022, 12),
        ferruleMat
      );
      ferrule.rotation.z = Math.PI / 2;
      ferrule.position.set(-0.028, 0.012, 0);
      g.add(ferrule);

      // 浅木色圆柄
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.013, 0.015, 0.1, 14),
        wood
      );
      handle.rotation.z = Math.PI / 2;
      handle.position.set(-0.085, 0.014, 0);
      g.add(handle);
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 10), wood);
      pommel.scale.set(1.05, 0.8, 1);
      pommel.position.set(-0.138, 0.014, 0);
      g.add(pommel);

      g.position.set(x, y, z);
      g.rotation.order = "YXZ";
      g.rotation.y = rotY;
      g.rotation.x = 0.03;
      g.rotation.z = -0.02;
      this.scene.add(g);
      return g;
    }

    addStool(x, z, color) {
      const mat = this.mat(color, null, { roughness: 0.86 });
      // 圆角感用扁方凳面
      this.box(0.42, 0.06, 0.42, mat, x, 0.48, z, false);
      const leg = 0.055;
      const h = 0.45;
      for (const [lx, lz] of [
        [-0.15, -0.15],
        [0.15, -0.15],
        [-0.15, 0.15],
        [0.15, 0.15],
      ]) {
        this.box(leg, h, leg, mat, x + lx, h / 2, z + lz, false);
      }
    }

    addKonghouProps(tex) {
      const wood = this.woodMat(tex.woodLight, 1.4, 1.8);
      const pale = this.mat(0xe8d9c0, null, { roughness: 0.9 });
      const woodMat = tex.woodLight ? wood : pale;

      // 四组均匀分布（里→外）：屏风 · 摞台 · 竖琴 · 佛像
      // 区间约 x=-12.4 ~ -6.4，z 靠区域中线
      const zMid = -4.7;

      // 1) 最里侧：深色云头屏风（摞台左侧）
      const screens = this.makeDarkScreens();
      screens.position.set(-12.35, 0, zMid - 0.15);
      screens.rotation.y = 0.2;
      this.scene.add(screens);

      // 2) 黑漆茶几式摞台（两摞并排）
      const stackA = this.makeBlackTeaStack(4);
      stackA.position.set(-10.85, 0, zMid - 0.45);
      stackA.rotation.y = 0.12;
      this.scene.add(stackA);
      const stackB = this.makeBlackTeaStack(4);
      stackB.position.set(-10.85, 0, zMid + 0.55);
      stackB.rotation.y = 0.1;
      this.scene.add(stackB);

      // 3) 未上色竖琴：前二后二
      const spots = [
        { x: -8.95, z: zMid + 0.35, rot: 0.55 },
        { x: -7.95, z: zMid + 0.5, rot: 0.7 },
        { x: -9.15, z: zMid - 0.65, rot: 0.4 },
        { x: -8.1, z: zMid - 0.55, rot: 0.58 },
      ];
      spots.forEach((s, i) => {
        const harp = this.makeKonghou(woodMat, i * 0.03);
        harp.position.set(s.x, 0, s.z);
        harp.rotation.y = s.rot;
        harp.scale.setScalar(1.02);
        this.scene.add(harp);
      });

      // 4) 最外侧：佛像（竖琴右侧）
      const buddha = this.makeBuddhaStatue();
      buddha.position.set(-6.55, 0, zMid + 0.1);
      buddha.rotation.y = -0.85;
      buddha.scale.setScalar(1.05);
      this.scene.add(buddha);

      this.colliders.push(
        { minX: -12.85, maxX: -11.85, minZ: zMid - 0.7, maxZ: zMid + 0.5 },
        { minX: -11.45, maxX: -10.25, minZ: zMid - 0.95, maxZ: zMid + 1.05 },
        { minX: -9.65, maxX: -7.45, minZ: zMid - 1.1, maxZ: zMid + 1.0 },
        { minX: -7.05, maxX: -6.05, minZ: zMid - 0.55, maxZ: zMid + 0.55 }
      );
    }

    makeDarkScreens() {
      // 三扇皆下半镂空；云头三峰规整，只做凹痕边线（无藤蔓包边）
      const g = new THREE.Group();
      const mat = this.mat(0x17171a, null, { metalness: 0.1, roughness: 0.48 });
      const grooveMat = this.mat(0x0a0a0c, null, { metalness: 0.05, roughness: 0.7 });
      const postMat = this.mat(0x1c1c20, null, { metalness: 0.08, roughness: 0.52 });
      const shoeMat = this.mat(0x222226, null, { metalness: 0.08, roughness: 0.55 });

      const extrudeOpts = {
        depth: 0.036,
        bevelEnabled: true,
        bevelThickness: 0.003,
        bevelSize: 0.003,
        bevelSegments: 1,
      };

      // 规整三峰：左右对称小圆峰 + 中高峰
      const drawCloudTop = (shape, w, y0, peak, s = 1) => {
        const sidePeak = peak * 0.52;
        const valley = peak * 0.08;
        // 左峰
        shape.quadraticCurveTo(-w * 0.9 * s, y0 + sidePeak * 0.55, -w * 0.68 * s, y0 + sidePeak);
        shape.quadraticCurveTo(-w * 0.48 * s, y0 + sidePeak * 0.55, -w * 0.36 * s, y0 + valley);
        // 中峰
        shape.quadraticCurveTo(-w * 0.16 * s, y0 + peak * 0.75, 0, y0 + peak);
        shape.quadraticCurveTo(w * 0.16 * s, y0 + peak * 0.75, w * 0.36 * s, y0 + valley);
        // 右峰
        shape.quadraticCurveTo(w * 0.48 * s, y0 + sidePeak * 0.55, w * 0.68 * s, y0 + sidePeak);
        shape.quadraticCurveTo(w * 0.9 * s, y0 + sidePeak * 0.55, w * s, y0);
      };

      const makeHeadShape = (w, openH, bodyH, peak, inset = 1) => {
        const ww = w * inset;
        const shape = new THREE.Shape();
        const top = bodyH - (1 - inset) * 0.02;
        const bot = openH + (1 - inset) * (bodyH - openH) * 0.15;
        shape.moveTo(-ww, bot);
        shape.lineTo(-ww, top);
        drawCloudTop(shape, w, top, peak * inset, inset);
        shape.lineTo(ww, bot);
        shape.lineTo(-ww, bot);
        return shape;
      };

      const addHollow = (w, bodyH, peak, openH, ox, oz, rotY) => {
        const local = new THREE.Group();

        // 上半实心云头板
        local.add(
          new THREE.Mesh(new THREE.ExtrudeGeometry(makeHeadShape(w, openH, bodyH, peak, 1), extrudeOpts), mat)
        );

        // 凹痕边线：略小一圈的暗色浅浮雕（贴在正面）
        const groove = new THREE.Mesh(
          new THREE.ExtrudeGeometry(makeHeadShape(w, openH, bodyH, peak, 0.9), {
            depth: 0.006,
            bevelEnabled: false,
          }),
          grooveMat
        );
        groove.position.z = 0.034;
        local.add(groove);
        // 再嵌一圈更浅的内线，形成凹边
        const inner = new THREE.Mesh(
          new THREE.ExtrudeGeometry(makeHeadShape(w, openH, bodyH, peak, 0.82), {
            depth: 0.004,
            bevelEnabled: false,
          }),
          mat
        );
        inner.position.z = 0.038;
        local.add(inner);

        // 下半镂空边框
        const postW = 0.05;
        const postH = openH - 0.02;
        const left = new THREE.Mesh(new THREE.BoxGeometry(postW, postH, 0.036), postMat);
        left.position.set(-w + postW / 2, postH / 2 + 0.02, 0.018);
        local.add(left);
        const right = new THREE.Mesh(new THREE.BoxGeometry(postW, postH, 0.036), postMat);
        right.position.set(w - postW / 2, postH / 2 + 0.02, 0.018);
        local.add(right);

        const rail = new THREE.Mesh(new THREE.BoxGeometry(w * 2 - postW, 0.04, 0.036), shoeMat);
        rail.position.set(0, openH + 0.008, 0.018);
        local.add(rail);

        const shoe = new THREE.Mesh(new THREE.BoxGeometry(w * 2.1, 0.04, 0.09), shoeMat);
        shoe.position.set(0, 0.02, 0.02);
        local.add(shoe);

        local.position.set(ox, 0, oz);
        local.rotation.y = rotY;
        g.add(local);
      };

      // 左矮 → 中 → 右高，三扇皆下半空
      addHollow(0.34, 1.35, 0.3, 0.78, -0.42, 0.08, -0.04);
      addHollow(0.36, 1.52, 0.33, 0.88, -0.02, 0.0, 0.04);
      addHollow(0.38, 1.72, 0.36, 0.98, 0.42, -0.06, 0.1);

      return g;
    }

    makeBuddhaStatue() {
      // 深色坐佛：结跏趺坐 + 袈裟褶示意（低模可读）
      const g = new THREE.Group();
      const bronze = this.mat(0x2a2420, null, { metalness: 0.35, roughness: 0.55 });
      const bronzeHi = this.mat(0x3d342c, null, { metalness: 0.4, roughness: 0.48 });
      const baseMat = this.mat(0x1a1816, null, { roughness: 0.7 });

      // 须弥座
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.12, 16), baseMat);
      base.position.y = 0.06;
      g.add(base);
      const baseTop = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16), bronzeHi);
      baseTop.position.y = 0.14;
      g.add(baseTop);

      // 盘腿
      const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.16, 4, 8), bronze);
      legL.rotation.z = Math.PI / 2;
      legL.rotation.y = 0.35;
      legL.position.set(-0.06, 0.28, 0.06);
      g.add(legL);
      const legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.16, 4, 8), bronze);
      legR.rotation.z = Math.PI / 2;
      legR.rotation.y = -0.35;
      legR.position.set(0.06, 0.28, 0.06);
      g.add(legR);
      // 膝鼓起
      const kneeL = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), bronze);
      kneeL.position.set(-0.18, 0.3, 0.08);
      g.add(kneeL);
      const kneeR = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), bronze);
      kneeR.position.set(0.18, 0.3, 0.08);
      g.add(kneeR);

      // 躯干（略前倾袈裟）
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.42, 12), bronze);
      torso.position.set(0, 0.55, 0);
      g.add(torso);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), bronzeHi);
      belly.scale.set(1.1, 0.7, 0.9);
      belly.position.set(0, 0.42, 0.04);
      g.add(belly);

      // 袈裟搭肩
      const robeL = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.28, 4, 8), bronzeHi);
      robeL.rotation.z = 0.5;
      robeL.position.set(-0.14, 0.62, 0.02);
      g.add(robeL);
      const robeR = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.22, 4, 8), bronzeHi);
      robeR.rotation.z = -0.35;
      robeR.position.set(0.12, 0.58, 0.04);
      g.add(robeR);
      // 胸前垂褶
      for (let i = 0; i < 3; i++) {
        const fold = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.22 - i * 0.02, 0.02),
          bronzeHi
        );
        fold.position.set(-0.04 + i * 0.04, 0.5, 0.14);
        fold.rotation.x = 0.15;
        g.add(fold);
      }

      // 手臂合于腹前
      const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.18, 4, 8), bronze);
      armL.rotation.z = 1.1;
      armL.position.set(-0.16, 0.48, 0.1);
      g.add(armL);
      const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.18, 4, 8), bronze);
      armR.rotation.z = -1.1;
      armR.position.set(0.16, 0.48, 0.1);
      g.add(armR);
      const hands = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), bronze);
      hands.scale.set(1.3, 0.55, 0.9);
      hands.position.set(0, 0.38, 0.16);
      g.add(hands);

      // 头 + 螺髻
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.06, 10), bronze);
      neck.position.set(0, 0.78, 0);
      g.add(neck);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), bronze);
      head.position.set(0, 0.92, 0.02);
      g.add(head);
      const ushnisha = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), bronzeHi);
      ushnisha.position.set(0, 1.04, 0.01);
      g.add(ushnisha);
      // 耳
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.06, 3, 6), bronze);
        ear.position.set(s * 0.11, 0.9, 0.02);
        g.add(ear);
      }

      return g;
    }

    makeBlackTeaStack(tiers = 4) {
      // 黑漆茶几式台面摞高，带如意牙板轮廓
      const g = new THREE.Group();
      const lacquer = this.mat(0x0e0e10, null, { metalness: 0.18, roughness: 0.38 });
      const lacquerSoft = this.mat(0x1a1a1c, null, { metalness: 0.1, roughness: 0.5 });
      const unitH = 0.34;
      const topW = 0.95;
      const topD = 0.48;

      for (let t = 0; t < tiers; t++) {
        const y0 = t * unitH;
        const unit = new THREE.Group();

        // 台面
        const top = new THREE.Mesh(new THREE.BoxGeometry(topW, 0.04, topD), lacquer);
        top.position.set(0, y0 + unitH - 0.02, 0);
        unit.add(top);
        // 束腰
        const waist = new THREE.Mesh(
          new THREE.BoxGeometry(topW * 0.92, 0.06, topD * 0.88),
          lacquerSoft
        );
        waist.position.set(0, y0 + unitH - 0.08, 0);
        unit.add(waist);

        // 牙板（前檐波浪/如意）
        const apronY = y0 + unitH - 0.14;
        const apron = new THREE.Mesh(
          new THREE.BoxGeometry(topW * 0.88, 0.07, 0.04),
          lacquer
        );
        apron.position.set(0, apronY, topD * 0.42);
        unit.add(apron);
        for (let i = 0; i < 5; i++) {
          const scallop = new THREE.Mesh(
            new THREE.SphereGeometry(0.035, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
            lacquer
          );
          scallop.rotation.x = Math.PI;
          scallop.position.set(-0.32 + i * 0.16, apronY - 0.02, topD * 0.42);
          unit.add(scallop);
        }
        // 侧牙板
        for (const side of [-1, 1]) {
          const sideApron = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.07, topD * 0.75),
            lacquer
          );
          sideApron.position.set(side * topW * 0.42, apronY, 0);
          unit.add(sideApron);
        }

        // 四足（略内收马蹄）
        const legH = unitH - 0.16;
        for (const [lx, lz] of [
          [-0.38, -0.16],
          [0.38, -0.16],
          [-0.38, 0.16],
          [0.38, 0.16],
        ]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, legH, 0.05), lacquer);
          leg.position.set(lx, y0 + legH / 2, lz);
          unit.add(leg);
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.07), lacquerSoft);
          foot.position.set(lx, y0 + 0.015, lz);
          unit.add(foot);
        }

        // 顶层加一点阶梯式帽檐
        if (t === tiers - 1) {
          const crest = new THREE.Mesh(
            new THREE.BoxGeometry(topW * 0.7, 0.05, 0.06),
            lacquer
          );
          crest.position.set(0, y0 + unitH + 0.02, -topD * 0.35);
          unit.add(crest);
          const crest2 = new THREE.Mesh(
            new THREE.BoxGeometry(topW * 0.45, 0.04, 0.05),
            lacquerSoft
          );
          crest2.position.set(0, y0 + unitH + 0.06, -topD * 0.35);
          unit.add(crest2);
        }

        g.add(unit);
      }
      return g;
    }

    makeKonghou(woodMat, seed = 0) {
      // 未上色箜篌木胎：直柱 + 共鸣箱 + 天鹅颈曲线（雕花只做姿态示意）
      const g = new THREE.Group();
      const wood = woodMat;
      const woodDark = this.mat(0xd2c2a6, null, { roughness: 0.88 });
      const pegMat = this.mat(0x3a342c, null, { roughness: 0.7 });

      // —— 共鸣箱：下宽上收的扁箱 ——
      const bodyShape = new THREE.Shape();
      bodyShape.moveTo(-0.08, 0.04);
      bodyShape.lineTo(0.32, 0.04);
      bodyShape.quadraticCurveTo(0.38, 0.35, 0.34, 0.7);
      bodyShape.lineTo(0.28, 1.15);
      bodyShape.lineTo(-0.02, 1.22);
      bodyShape.quadraticCurveTo(-0.1, 0.7, -0.08, 0.04);
      const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
        depth: 0.12,
        bevelEnabled: true,
        bevelThickness: 0.012,
        bevelSize: 0.01,
        bevelSegments: 2,
      });
      const body = new THREE.Mesh(bodyGeo, wood);
      body.position.set(-0.05, 0, -0.06);
      g.add(body);
      // 面板略凸
      const face = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.95, 0.03),
        woodDark
      );
      face.position.set(0.1, 0.58, 0.07);
      g.add(face);

      // —— 前立柱 ——
      const pillarH = 1.42;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.07, pillarH, 0.07), wood);
      pillar.position.set(0.55, pillarH / 2, 0);
      g.add(pillar);
      // 柱顶方帽
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.1), woodDark);
      cap.position.set(0.55, pillarH + 0.02, 0);
      g.add(cap);

      // —— 琴颈主曲线：柱顶上扬 → 拱起 → 回落到共鸣箱 ——
      const neckCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.55, 1.42, 0),
        new THREE.Vector3(0.52, 1.58 + seed, 0),
        new THREE.Vector3(0.4, 1.72, 0), // 冠峰
        new THREE.Vector3(0.22, 1.62, 0),
        new THREE.Vector3(0.05, 1.42, 0),
        new THREE.Vector3(-0.05, 1.28, 0),
        new THREE.Vector3(-0.02, 1.2, 0),
      ]);
      const neck = new THREE.Mesh(
        new THREE.TubeGeometry(neckCurve, 40, 0.032, 8, false),
        wood
      );
      g.add(neck);
      // 颈脊加粗一条，强化厚度
      const neckRidge = new THREE.Mesh(
        new THREE.TubeGeometry(neckCurve, 40, 0.018, 6, false),
        woodDark
      );
      neckRidge.position.y = 0.02;
      g.add(neckRidge);

      // —— 冠峰雕花姿态（简化卷云，不抠细节）——
      const crown = new THREE.Group();
      crown.position.set(0.38, 1.72, 0);
      const plume = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(-0.04, 0.1, 0),
            new THREE.Vector3(-0.02, 0.18, 0),
            new THREE.Vector3(0.04, 0.22, 0),
          ]),
          12,
          0.016,
          6,
          false
        ),
        wood
      );
      crown.add(plume);
      const plume2 = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(0.02, 0.02, 0),
            new THREE.Vector3(0.08, 0.12, 0),
            new THREE.Vector3(0.1, 0.2, 0),
            new THREE.Vector3(0.04, 0.16, 0),
          ]),
          12,
          0.014,
          6,
          false
        ),
        woodDark
      );
      crown.add(plume2);
      // 小卷
      const curl = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 14, Math.PI * 1.2), wood);
      curl.rotation.y = Math.PI / 2;
      curl.position.set(-0.06, 0.08, 0);
      crown.add(curl);
      g.add(crown);

      // —— 弦孔（沿颈下缘一排暗点）——
      for (let i = 0; i < 14; i++) {
        const t = 0.12 + (i / 13) * 0.75;
        const p = neckCurve.getPoint(t);
        const peg = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 6), pegMat);
        peg.position.set(p.x, p.y - 0.035, p.z + 0.02);
        g.add(peg);
      }

      // —— 底座托 ——
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.05, 0.28), woodDark);
      base.position.set(0.22, 0.025, 0);
      g.add(base);
      const footL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.22), wood);
      footL.position.set(-0.05, 0.02, 0);
      g.add(footL);
      const footR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.22), wood);
      footR.position.set(0.55, 0.02, 0);
      g.add(footR);

      return g;
    }

    /**
     * @param {"x"|"z"} axis 墙面法线方向：x=走廊侧门（门扇沿 Z），z=荫房南门（门扇沿 X）
     */
    makeDoor(id, x, z, openDir, color = 0x5c4030, axis = "x", startOpen = false) {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      const leafW = 1.7;
      const leafT = 0.1;
      const door =
        axis === "z"
          ? new THREE.Mesh(
              new THREE.BoxGeometry(leafW, 2.4, leafT),
              this.mat(color, null, { roughness: 0.75 })
            )
          : new THREE.Mesh(
              new THREE.BoxGeometry(leafT, 2.4, leafW),
              this.mat(color, null, { roughness: 0.75 })
            );

      const pivot = new THREE.Group();
      if (axis === "z") {
        // 铰链在门洞左侧（-X）
        pivot.position.set(-leafW / 2, 0, 0);
        door.position.set(leafW / 2, 1.2, 0);
      } else {
        // 铰链在门洞前侧（-Z）
        pivot.position.set(0, 0, -leafW / 2);
        door.position.set(0, 1.2, leafW / 2);
      }
      pivot.add(door);
      group.add(pivot);

      const frameMat = this.mat(axis === "z" ? 0xa8926e : 0x4a1520);
      const top =
        axis === "z"
          ? new THREE.Mesh(new THREE.BoxGeometry(leafW + 0.2, 0.12, 0.18), frameMat)
          : new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, leafW + 0.25), frameMat);
      top.position.set(0, 2.48, 0);
      group.add(top);

      this.scene.add(group);
      const half = leafW / 2 + 0.05;
      const collider =
        axis === "z"
          ? { minX: x - half, maxX: x + half, minZ: z - 0.22, maxZ: z + 0.22 }
          : { minX: x - 0.22, maxX: x + 0.22, minZ: z - half, maxZ: z + half };

      const doorState = {
        id,
        group,
        pivot,
        open: !!startOpen,
        angle: startOpen ? (openDir * Math.PI) / 2 : 0,
        target: startOpen ? (openDir * Math.PI) / 2 : 0,
        openDir,
        collider,
      };
      if (startOpen) pivot.rotation.y = doorState.angle;
      this.doors.push(doorState);
      this.colliders.push(doorState.collider);
    }

    toggleNearestDoor() {
      const p = this.camera.position;
      let best = null;
      let bestD = 2.4;
      for (const d of this.doors) {
        const dx = d.group.position.x - p.x;
        const dz = d.group.position.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist < bestD) {
          bestD = dist;
          best = d;
        }
      }
      if (!best) return;
      best.open = !best.open;
      best.target = best.open ? (best.openDir * Math.PI) / 2 : 0;
    }

    onKey(e, down) {
      const k = e.code;
      this.keys[k] = down;
      if (down && (k === "KeyE" || k === "KeyF")) {
        e.preventDefault();
        this.toggleNearestDoor();
      }
      if (down && k === "Escape" && this.locked) {
        document.exitPointerLock?.();
      }
    }

    onClick() {
      if (!this.running) return;
      // if near door and not locked yet, still allow E; click locks pointer
      if (!this.locked) {
        this.renderer.domElement.requestPointerLock?.();
      }
    }

    onLockChange() {
      this.locked = document.pointerLockElement === this.renderer?.domElement;
      this.container.classList.toggle("is-locked", this.locked);
    }

    onMouse(e) {
      if (!this.locked) return;
      const sens = 0.0022;
      this.yaw -= e.movementX * sens;
      this.pitch -= e.movementY * sens;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch));
    }

    onResize() {
      if (!this.renderer || !this.camera) return;
      const w = this.container.clientWidth || 1;
      const h = this.container.clientHeight || 1;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
    }

    blocked(x, z) {
      const r = this.radius;
      for (const c of this.colliders) {
        // open doors don't block
        const door = this.doors.find((d) => d.collider === c);
        if (door?.open) continue;
        if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) {
          return true;
        }
      }
      // keep inside shell
      if (x < -14.4 || x > 14.4 || z < -8.4 || z > 8.4) return true;
      return false;
    }

    update(dt) {
      // animate doors
      for (const d of this.doors) {
        d.angle += (d.target - d.angle) * Math.min(1, dt * 8);
        d.pivot.rotation.y = d.angle;
      }

      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const move = new THREE.Vector3();
      const crouch = !!(this.keys.ShiftLeft || this.keys.ShiftRight);
      const targetEye = crouch ? this.eyeCrouch : this.eyeStand;
      this.eyeCurrent += (targetEye - this.eyeCurrent) * Math.min(1, dt * 14);
      this.eye = this.eyeCurrent;

      if (this.keys.KeyW || this.keys.ArrowUp) move.add(forward);
      if (this.keys.KeyS || this.keys.ArrowDown) move.sub(forward);
      if (this.keys.KeyD || this.keys.ArrowRight) move.add(right);
      if (this.keys.KeyA || this.keys.ArrowLeft) move.sub(right);
      if (move.lengthSq() > 0) {
        const spd = crouch ? this.speed * 0.55 : this.speed;
        move.normalize().multiplyScalar(spd * dt);
        const p = this.camera.position;
        const nx = p.x + move.x;
        const nz = p.z + move.z;
        if (!this.blocked(nx, p.z)) p.x = nx;
        if (!this.blocked(p.x, nz)) p.z = nz;
      }
      this.camera.position.y = this.eyeCurrent;
      this.camera.rotation.order = "YXZ";
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;

      for (const label of this.labels) {
        label.quaternion.copy(this.camera.quaternion);
      }
    }
  }

  global.Workshop3D = Workshop3D;
})(typeof window !== "undefined" ? window : globalThis);
