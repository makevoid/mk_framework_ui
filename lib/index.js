import { Component } from './component.js';
import { Renderer } from './dom.js';
import { Router } from './router.js';
import { API } from './api/index.js';
import { TW } from './tw.js';
import { elements, ElementRegistry } from './elements.js';

export { Component, Renderer, Router, API, TW, elements, ElementRegistry };
export const MkFrame = { Component, Renderer, Router, API, TW, elements, ElementRegistry };
export default MkFrame;
